require('dotenv').config();
const fs = require('fs');
const xml2js = require('xml2js');
const Shopify = require('shopify-api-node');

// Initialize Shopify API
const shopify = new Shopify({
  shopName: process.env.SHOP_NAME,
  apiKey: process.env.SHOPIFY_API_KEY,
  password: process.env.SHOPIFY_API_PASSWORD,
});

// Function to parse the XML file
const parseXMLFile = async (filePath) => {
  try {
    const xmlData = fs.readFileSync(filePath, 'utf8');
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(xmlData);

    // Extract product IDs and allocations from XML
    const records = result.inventory['inventory-list'].records.record;
    const productData = Array.isArray(records)
      ? records.map((record) => ({
          productId: record['$']['product-id'],
          allocation: parseInt(record.allocation, 10),
        }))
      : [
          {
            productId: records['$']['product-id'],
            allocation: parseInt(records.allocation, 10),
          },
        ];

    return productData;
  } catch (error) {
    console.error('Error parsing XML file:', error.message);
    throw error;
  }
};

// Function to fetch and print Shopify products by ID and update inventory
const fetchAndPrintProducts = async (productData) => {
  try {
    for (const { productId, allocation } of productData) {
      try {
        const product = await shopify.product.get(productId);

        console.log(`Product ID: ${productId}`);
        console.log(`Title: ${product.title}`);
        console.log(`Current Inventory: ${product.variants[0].inventory_quantity}`);
        console.log(`Allocation from XML: ${allocation}`);

        // Update inventory 
        if (allocation >= 0) {
          await shopify.inventoryLevel.set({
            location_id: process.env.SHOPIFY_LOCATION_ID,
            inventory_item_id: product.variants[0].inventory_item_id,
            available: allocation,
          });
          console.log(`Inventory updated to ${allocation} for Product ID: ${productId}`);
        }
        console.log('---');
      } catch (error) {
        console.error(`Error fetching or updating product with ID ${productId}:`, error.message);
      }
    }
  } catch (error) {
    console.error('Error processing products:', error.message);
  }
};

// Main function
const main = async () => {
  try {
    const xmlFilePath = './Inventory.xml'; // Path to your XML file
    const productData = await parseXMLFile(xmlFilePath);

    console.log(`Product Data extracted from XML:`, productData);
    await fetchAndPrintProducts(productData);
  } catch (error) {
    console.error('Error in main function:', error.message);
  }
};

// Run the script
main();
