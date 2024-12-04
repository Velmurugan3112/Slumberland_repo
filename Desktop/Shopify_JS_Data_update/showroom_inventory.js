const fs = require('fs');
const xml2js = require('xml2js');
const axios = require('axios');

// Function to read and parse XML
async function parseXML(filePath) {
    const parser = new xml2js.Parser({ explicitArray: false });
    const xmlData = fs.readFileSync(filePath, 'utf-8');
    return parser.parseStringPromise(xmlData);
}

// Extract SKUs from parsed XML
function extractSKUs(parsedXML) {
    // Adjust based on actual XML schema
    const inventoryItems = parsedXML.Inventory.Items || [];
    const skus = inventoryItems
        .filter(item => item.Showroom === 'Yes') // Assuming "Showroom" indicates availability
        .map(item => item.SKU)
        .filter(Boolean); // Remove any null/undefined values
    return [...new Set(skus)]; // Deduplicate SKUs
}

// Update metafield
async function updateMetafield(locationId, skus) {
    const metafieldValue = JSON.stringify(skus);
    try {
        const response = await axios.put(
            `https://api.example.com/locations/${locationId}/metafields/products_on_display`,
            { value: metafieldValue },
            {
                headers: {
                    Authorization: 'Bearer YOUR_API_TOKEN',
                    'Content-Type': 'application/json',
                },
            }
        );
        console.log('Metafield updated successfully:', response.data);
    } catch (error) {
        console.error('Error updating metafield:', error.message);
    }
}

// Main function
async function importShowroomInventory(filePath, locationId) {
    try {
        // Step 1: Parse XML
        const parsedXML = await parseXML(filePath);

        // Step 2: Extract SKUs
        const skus = extractSKUs(parsedXML);

        // Step 3: Update Metafield
        await updateMetafield(locationId, skus);
    } catch (error) {
        console.error('Error importing inventory:', error.message);
    }
}

// Example usage
const xmlFilePath = './inventory.xml'; // Path to the XML file
const locationId = '12345'; // Example location ID
importShowroomInventory(xmlFilePath, locationId);
