require('dotenv').config();
const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const Shopify = require('shopify-api-node');

// Initialize Shopify API
const shopify = new Shopify({
  shopName: process.env.SHOP_NAME,
  apiKey: process.env.SHOPIFY_API_KEY,
  password: process.env.SHOPIFY_API_PASSWORD,
});

// Local directory for testing
const localDir = './local_inventory';
const archiveDir = './archive';

// Function to process inventory files
const processInventoryFiles = async () => {
  try {
    // Read files from the local directory
    const files = fs.readdirSync(localDir).filter((file) => file.startsWith('_Inventory_') && file.endsWith('.xml'));

    for (const file of files) {
      console.log(`Processing file: ${file}`);
      const filePath = path.join(localDir, file);
      const xmlData = fs.readFileSync(filePath, 'utf8');

      // Parse XML
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(xmlData);

      // Process inventory data
      const inventoryData = result.Inventory; // Adjust based on XML structure
      for (const item of inventoryData.Item) {
        const sku = item.SKU[0];
        const quantity = parseInt(item.Quantity[0], 10);

        // Update inventory on Shopify
        try {
          await shopify.inventoryLevel.set(sku, quantity);
          console.log(`Updated inventory for SKU: ${sku} to quantity: ${quantity}`);
        } catch (error) {
          console.error(`Error updating SKU: ${sku}`, error);
        }
      }

      // Archive file
      const archivePath = path.join(archiveDir, new Date().toISOString().split('T')[0]);
      if (!fs.existsSync(archivePath)) fs.mkdirSync(archivePath, { recursive: true });
      fs.renameSync(filePath, path.join(archivePath, file));
      console.log(`Archived file: ${file}`);
    }
  } catch (error) {
    console.error('Error processing inventory files:', error);
  }
};

// Execute the function
processInventoryFiles();
