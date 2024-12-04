require('dotenv').config();
const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const Shopify = require('shopify-api-node');

// Initialize Shopify API client
const shopify = new Shopify({
  shopName: process.env.SHOP_NAME,
  apiKey: process.env.SHOPIFY_API_KEY,
  password: process.env.SHOPIFY_API_PASSWORD,
});

// Function to parse XML file
const parseXML = async (filePath) => {
  const xmlData = fs.readFileSync(filePath, 'utf-8');
  const parser = new xml2js.Parser({ explicitArray: false });
  return parser.parseStringPromise(xmlData);
};

// Function to update inventory in Shopify
const updateInventory = async (inventoryData) => {
  const records = inventoryData.inventory['inventory-list']['record'];

  for (const record of records) {
    const productId = record['product-id'];
    const allocation = parseInt(record.allocation, 10);

    try {
      // Fetch Shopify variant by product SKU (product-id in XML)
      const productVariants = await shopify.product.list({
        fields: 'id,variants',
      });

      let variantId = null;
      for (const product of productVariants) {
        const variant = product.variants.find((v) => v.sku === productId);
        if (variant) {
          variantId = variant.id;
          break;
        }
      }

      if (variantId) {
        // Update inventory level
        await shopify.inventoryLevel.set({
          inventory_item_id: variantId,
          available: allocation,
        });
        console.log(
          `Updated inventory for product-id: ${productId} to ${allocation}`
        );
      } else {
        console.warn(`No variant found for product-id: ${productId}`);
      }
    } catch (error) {
      console.error(`Error updating inventory for ${productId}:`, error.message);
    }
  }
};

// Main function
const processInventoryFile = async () => {
  try {
    const inventoryFile = path.join(
      '/E:/SFTP/ECOMMERCE/Shopify/inventory',
      '_Inventory_Example.xml'
    );
    const inventoryData = await parseXML(inventoryFile);

    console.log('Parsed Inventory Data:', inventoryData);
    await updateInventory(inventoryData);

    // Move processed file to archive folder
    const archivePath = path.join(
      '/E:/SFTP/ECOMMERCE/Shopify/archive',
      `2024-06-09/_Inventory_US_Example.xml`
    );
    fs.renameSync(inventoryFile, archivePath);
    console.log(`Archived inventory file to: ${archivePath}`);
  } catch (error) {
    console.error('Error processing inventory file:', error.message);
  }
};

// Run the script
processInventoryFile();
