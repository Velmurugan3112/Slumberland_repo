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

    // Extract product IDs from XML
    const records = result.inventory['inventory-list'].records.record;
    const productIds = records.map((record) => record['$']['product-id']);
    return productIds;
  } catch (error) {
    console.error('Error parsing XML file:', error);
  }
};

// Function to fetch and print Shopify products by ID
const fetchAndPrintProducts = async (productIds) => {
  try {
    for (const productId of productIds) {
      try {
        const product = await shopify.product.get(productId);
        console.log(`Product ID: ${productId}`);
        console.log(`Title: ${product.title}`);
        console.log(`Inventory Available: ${product.variants[0].inventory_quantity}`);
        console.log('---');
      } catch (error) {
        console.error(`Error fetching product with ID ${productId}:`, error.message);
      }
    }
  } catch (error) {
    console.error('Error fetching products:', error);
  }
};

// Main function
const main = async () => {
  try {
    const xmlFilePath = './Inventory.xml'; // Path to your XML file
    const productIds = await parseXMLFile(xmlFilePath);

    console.log(`Product IDs extracted from XML: ${productIds}`);
    await fetchAndPrintProducts(productIds);
  } catch (error) {
    console.error('Error in main function:', error);
  }
};

// Run the script
main();
