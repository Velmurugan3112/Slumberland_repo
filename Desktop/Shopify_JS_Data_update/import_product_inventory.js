const fs = require('fs');
const xml2js = require('xml2js');
const Shopify = require('shopify-api-node');

// Shopify API Configuration
const shopify = new Shopify({
  shopName: 'your-shop-name', // Replace with your Shopify shop name
  apiKey: 'your-api-key',     // Replace with your Shopify API key
  password: 'your-password'   // Replace with your Shopify API password
});

// Criteria for availability status
const getAvailabilityStatus = (qty) => {
  if (qty === 0) return "On Order";
  if (qty < 12) return "Limited Stock";
  return "Available";
};

// Update Shopify product variant
const updateShopifyVariant = async (variantId, availability) => {
  try {
    await shopify.productVariant.update(variantId, {
      metafields: [
        {
          namespace: "global", // Shopify metafield namespace
          key: "availability", // Metafield key
          value: availability,
          type: "string"        // Metafield type
        }
      ]
    });
    console.log(`Updated variant ${variantId} with availability: ${availability}`);
  } catch (error) {
    console.error(`Error updating variant ${variantId}:`, error.message);
  }
};

// Process Inventory XML and update Shopify
const processInventory = async (filePath) => {
  try {
    // Read and parse the XML file
    const xmlData = fs.readFileSync(filePath, 'utf8');
    const parser = new xml2js.Parser({ explicitArray: false });
    const jsonData = await parser.parseStringPromise(xmlData);

    // Ensure the expected structure exists
    if (!jsonData.Inventory || !jsonData.Inventory.Product) {
      console.error("Invalid XML structure: Missing Inventory/Product.");
      return;
    }

    // Iterate through products
    const products = Array.isArray(jsonData.Inventory.Product)
      ? jsonData.Inventory.Product
      : [jsonData.Inventory.Product];

    for (const product of products) {
      const sortCode = product.SortCode;
      const qty = parseInt(product.Qty, 10);
      const variantId = product.VariantId; // Ensure VariantId is available in XML
      const isPackage = product.PackageDetails?.PackageSKU;

      // Only process products with SortCode = OLW
      if (sortCode === "OLW") {
        let availability;

        // For packages, calculate the minimum qty for all items in the package
        if (isPackage && Array.isArray(product.PackageDetails.PackageItem)) {
          const packageItems = product.PackageDetails.PackageItem;
          const packageQty = Math.min(...packageItems.map((item) => parseInt(item.Qty, 10)));
          availability = getAvailabilityStatus(packageQty);
        } else {
          // For regular products
          availability = getAvailabilityStatus(qty);
        }

        // Update Shopify with the calculated availability
        if (variantId) {
          await updateShopifyVariant(variantId, availability);
        } else {
          console.warn("VariantId not found for product:", product);
        }
      }
    }
  } catch (error) {
    console.error("Error processing inventory:", error.message);
  }
};

// Example usage
const filePath = './inventory.xml'; // Replace with your XML file path
processInventory(filePath);
