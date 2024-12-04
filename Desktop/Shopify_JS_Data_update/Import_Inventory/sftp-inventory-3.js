require('dotenv').config();
const Shopify = require('shopify-api-node');
const SFTPClient = require('ssh2-sftp-client');
const xml2js = require('xml2js');

/**
 * Transforms the list-id format.
 * Example: "store-01-abc" -> "Store 01 Store"
 */
function transformValue(input) {
    return input.replace(/^([a-z]+)-(\d+)-.*$/i, (_, storeName, storeNumber) => {
        const formattedStoreName = storeName.charAt(0).toUpperCase() + storeName.slice(1);
        return `${formattedStoreName} Store ${storeNumber.padStart(2, '0')}`;
    });
}

// Initialize Shopify API with credentials
const shopify = new Shopify({
    shopName: process.env.SHOP_NAME,
    apiKey: process.env.SHOPIFY_API_KEY,
    password: process.env.SHOPIFY_API_PASSWORD,
    apiVersion: '2024-10',
});

// SFTP Configuration
const sftpConfig = {
    host: process.env.SFTP_HOST,
    port: process.env.SFTP_PORT || 22,
    username: process.env.SFTP_USERNAME,
    password: process.env.SFTP_PASSWORD,
};
const remoteDir = process.env.SFTP_ORDERSTATUS_REMOTE_DIR || '/local_inventory';

/**
 * Ensures the remote directory exists on the SFTP server.
 * If it doesn't exist, it will create it.
 */
async function ensureRemoteDirectory(sftp, directory) {
    const parts = directory.split('/');
    let currentPath = '';

    for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        try {
            const directoryExists = await sftp.exists(currentPath);
            if (!directoryExists) {
                await sftp.mkdir(currentPath, true);
                console.log(`Created remote directory: ${currentPath}`);
            }
        } catch (error) {
            console.error(`Error ensuring remote directory: ${currentPath}`, error.message);
            throw error;
        }
    }
}

/**
 * Updates the inventory for a specific location and product in Shopify.
 */
async function updateInventory(locationName, productID, allocation) {
    try {
        const locations = await shopify.location.list();
        const location = locations.find(loc => loc.name === locationName);

        if (!location) {
            throw new Error(`Location '${locationName}' not found.`);
        }

        const locationId = location.id;
        const products = await shopify.product.list({ limit: 250 });
        let inventoryItemId = null;

        for (const product of products) {
            const variant = product.variants.find(v => v.sku === productID);
            if (variant) {
                inventoryItemId = variant.inventory_item_id;
                break;
            }
        }

        if (!inventoryItemId) {
            throw new Error(`No product found with SKU '${productID}'.`);
        }

        await shopify.inventoryLevel.set({
            inventory_item_id: inventoryItemId,
            location_id: locationId,
            available: allocation,
        });

        console.log(`Updated SKU '${productID}' at '${locationName}' to ${allocation}.`);
    } catch (error) {
        console.error(`Error updating inventory for location '${locationName}':`, error.message);
    }
}

/**
 * Processes the XML inventory file and updates inventory in Shopify.
 */
async function processInventoryFile(sftp, remoteFilePath) {
    const parser = new xml2js.Parser({ explicitArray: false });

    try {
        const xmlData = await sftp.get(remoteFilePath); // Read file directly from SFTP
        const result = await parser.parseStringPromise(xmlData.toString('utf-8'));
        const inventoryList = result['inventory']['inventory-list'];
        const rawListId = inventoryList['header']['$']['list-id'];
        const transformedListId = transformValue(rawListId);

        const records = inventoryList['records']['record'];
        for (const record of records) {
            const productId = record['$']['product-id'];
            const allocation = parseInt(record['allocation'], 10);
            console.log(`Processing Product ID: ${productId}, Allocation: ${allocation}`);

            // Update inventory for specific location
            await updateInventory(transformedListId, productId, allocation);

            // Update inventory for Default Warehouse Z1
            await updateInventory('Default Warehouse Z1', productId, allocation);
        }
    } catch (error) {
        console.error('Error processing file:', error.message);
    }
}

/**
 * Fetches files from the SFTP server, processes them, and archives them.
 */
async function fetchFilesFromSFTP() {
    const sftp = new SFTPClient();
    const dateFolder = new Date().toISOString().split('T')[0];
    const remoteArchiveDir = `/archive/${dateFolder}`;

    try {
        // Connect to SFTP server
        await sftp.connect(sftpConfig);

        // Ensure the archive directory exists on the SFTP server
        await ensureRemoteDirectory(sftp, remoteArchiveDir);

        // List files in the remote directory
        const fileList = await sftp.list(remoteDir);
        const orderStatusFiles = fileList.filter(file => file.name.startsWith('Order_Status') && file.name.endsWith('.xml'));

        if (orderStatusFiles.length === 0) {
            console.warn('No matching files found in the remote directory.');
            return;
        }

        for (const file of orderStatusFiles) {
            const remoteFilePath = `${remoteDir}/${file.name}`;
            const remoteArchivePath = `${remoteArchiveDir}/${file.name}`;

            console.log(`Processing ${file.name} from SFTP server`);

            // Process the file directly
            await processInventoryFile(sftp, remoteFilePath);

            // Move the processed file to the archive directory on the SFTP server
            await sftp.rename(remoteFilePath, remoteArchivePath);
            console.log(`Archived ${file.name} to ${remoteArchivePath} on SFTP server`);
        }
    } catch (error) {
        console.error('Error fetching files from SFTP:', error.message);
    } finally {
        await sftp.end();
    }
}

// Execute the script
fetchFilesFromSFTP();
