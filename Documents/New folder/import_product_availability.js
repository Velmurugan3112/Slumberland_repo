require('dotenv').config();
const Shopify = require('shopify-api-node');
const SFTPClient = require('ssh2-sftp-client');
const xml2js = require('xml2js');

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
const remoteDir = process.env.SFTP_INV_REMOTE_DIR;

/**
 * Ensures the remote directory exists on the SFTP server.
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
 * Updates the metafield for product availability in Shopify.
 */
async function updateAvailabilityMetafield(productId, availability) {
    try {
        const products = await shopify.product.list({ limit: 250 });
        let variantId = null;

        for (const product of products) {
            const variant = product.variants.find(v => v.sku === productId);
            if (variant) {
                variantId = variant.id;
                break;
            }
        }

        if (!variantId) {
            throw new Error(`No product variant found with SKU '${productId}'.`);
        }

        // Update metafield
        await shopify.metafield.create({
            namespace: 'custom',
            key: 'availability',
            value: availability,
            value_type: 'string',
            owner_resource: 'variant',
            owner_id: variantId,
        });

        console.log(`Updated availability metafield for SKU '${productId}' to '${availability}'.`);
    } catch (error) {
        console.error(`Error updating metafield for SKU '${productId}':`, error.message);
    }
}

/**
 * Processes the XML inventory file and updates metafields in Shopify.
 */
async function processInventoryFile(sftp, remoteFilePath) {
    const parser = new xml2js.Parser({
        explicitArray: false, // Simplifies parsing
        tagNameProcessors: [xml2js.processors.stripPrefix], // Remove namespaces
    });

    try {
        const xmlData = await sftp.get(remoteFilePath); // Fetch file from SFTP
        const result = await parser.parseStringPromise(xmlData.toString('utf-8'));

        const catalog = result['catalog'];
        if (!catalog || !catalog['product']) {
            throw new Error('No products found in the XML file.');
        }

        // Handle single product or array of products
        const products = Array.isArray(catalog['product']) ? catalog['product'] : [catalog['product']];

        for (const product of products) {
            const productId = product['$']?.['product-id'];
            const customAttributes = product['custom-attributes']?.['custom-attribute'];
            let availability = null;

            if (Array.isArray(customAttributes)) {
                // Find availability in multiple attributes
                const availabilityAttr = customAttributes.find(attr => attr['$']?.['attribute-id'] === 'availability');
                availability = availabilityAttr?.['value'];
            } else if (customAttributes?.['$']?.['attribute-id'] === 'availability') {
                availability = customAttributes['value'];
            }

            if (!productId) {
                console.warn('Skipping product with missing product-id.');
                continue;
            }

            console.log(`Processing Product ID: ${productId}, Availability: ${availability || 'Not Specified'}`);

            // Update Shopify metafield
            await updateAvailabilityMetafield(productId, availability || 'Available');
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
        const inventoryFiles = fileList.filter(file => file.name.startsWith('_XmlProduct') && file.name.endsWith('.xml'));

        if (inventoryFiles.length === 0) {
            console.warn('No matching files found in the remote directory.');
            return;
        }

        for (const file of inventoryFiles) {
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
