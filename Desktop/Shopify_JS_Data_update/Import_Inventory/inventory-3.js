require('dotenv').config();
const Shopify = require('shopify-api-node');
const fs = require('fs');
const xml2js = require('xml2js');
 
// Function to transform the list-id
function transformValue(input) {
    return input.replace(/^([a-z]+)-(\d+)-.*$/i, (_, storeName, storeNumber) => {
        // Capitalize the store name
        const formattedStoreName = storeName.charAt(0).toUpperCase() + storeName.slice(1);
        // Return formatted result
        return `${formattedStoreName} Store ${storeNumber.padStart(2, '0')}`;
    });
}
 
// Initialize Shopify API
const shopify = new Shopify({
  shopName: process.env.SHOP_NAME,
  apiKey: process.env.SHOPIFY_API_KEY,
  password: process.env.SHOPIFY_API_PASSWORD,
  apiVersion: '2024-10', // Use the correct API version
});
 
// Function to update inventory in Shopify
async function updateInventory(transferredListID, productID, allocation) {
  try {
    // Step 1: Get the location ID based on the transferred list ID
    const locations = await shopify.location.list();
    const location = locations.find(loc => loc.name === transferredListID);
 
    if (!location) {
      throw new Error(`Location '${transferredListID}' not found.`);
    }
 
    const locationId = location.id;
    console.log(`Location ID for '${transferredListID}': ${locationId}`);
 
    // Step 2: Find the product and get its inventory item ID
    const products = await shopify.product.list({ limit: 250 }); // Fetch products
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
 
    console.log(`Inventory Item ID for SKU '${productID}': ${inventoryItemId}`);
 
    // Step 3: Update the inventory allocation
    await shopify.inventoryLevel.set({
      inventory_item_id: inventoryItemId,
      location_id: locationId,
      available: allocation, // Set the new allocation value
    });
 
    console.log(`Successfully updated allocation for SKU '${productID}' at location '${transferredListID}' to ${allocation}.`);
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Full error details:', error);
  }
}
 
// Read and process the XML file
const xmlFilePath = 'Inventory.xml'; // Replace with your XML file path
const xmlData = fs.readFileSync(xmlFilePath, 'utf-8');
 
// Parse the XML
const parser = new xml2js.Parser({ explicitArray: false });
parser.parseString(xmlData, async (err, result) => {
  if (err) {
    console.error("Error parsing XML:", err);
    return;
  }
 
  // Navigate to the inventory-list
  const inventoryList = result['inventory']['inventory-list'];
 
  // Get the list-id from the header and transform it
  const rawListId = inventoryList['header']['$']['list-id'];
  const transformedListId = transformValue(rawListId);
  console.log("Transformed List ID:", transformedListId);
 
  // Get the records and update inventory for each record
  const records = inventoryList['records']['record'];
 
  for (const record of records) {
    const productId = record['$']['product-id'];
    const allocation = parseInt(record['allocation'], 10); // Convert allocation to a number
    console.log(`Processing Product ID: ${productId}, Allocation: ${allocation}`);
    // Call the function to update inventory
    await updateInventory(transformedListId, productId, allocation);
  }
});