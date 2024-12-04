require('dotenv').config();
const Shopify = require('shopify-api-node');
const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

// Function to transform the list-id
function transformValue(input) {
    return input.replace(/^([a-z]+)-(\d+)-.*$/i, (_, storeName, storeNumber) => {
        const formattedStoreName = storeName.charAt(0).toUpperCase() + storeName.slice(1);
        return `${formattedStoreName} Store ${storeNumber.padStart(2, '0')}`;
    });
}

// Initialize Shopify API
const shopify = new Shopify({
    shopName: process.env.SHOP_NAME,
    apiKey: process.env.SHOPIFY_API_KEY,
    password: process.env.SHOPIFY_API_PASSWORD,
    apiVersion: '2024-10',
});

// Function to update inventory in Shopify
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

// Process the XML inventory file
async function processInventoryFile(filePath) {
    const archiveDir = path.join(__dirname, 'archive', new Date().toISOString().split('T')[0]);
    const parser = new xml2js.Parser({ explicitArray: false });

    try {
        const xmlData = fs.readFileSync(filePath, 'utf-8');
        const result = await parser.parseStringPromise(xmlData);
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

        // Archive the processed file
        if (!fs.existsSync(archiveDir)) {
            fs.mkdirSync(archiveDir, { recursive: true });
        }
        const archivePath = path.join(archiveDir, path.basename(filePath));
        fs.renameSync(filePath, archivePath);
        console.log(`File archived to ${archivePath}`);
    } catch (error) {
        console.error('Error processing file:', error.message);
    }
}

// File paths and execution
const inputDir = path.join(__dirname, 'local_inventory');

// Ensure input directory exists
if (!fs.existsSync(inputDir)) fs.mkdirSync(inputDir, { recursive: true });

// Process each XML file in the input directory
fs.readdirSync(inputDir).forEach(file => {
    if (file.startsWith('Order_Status') && file.endsWith('.xml')) {
        const filePath = path.join(inputDir, file);
        processInventoryFile(filePath);
    }
});
