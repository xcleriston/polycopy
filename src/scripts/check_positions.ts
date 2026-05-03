import fetchData from '../utils/fetchData.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function check() {
    const addr = '0xa73803ec2116e5154EE39cAE4A35b21F8fd7e03B';
    console.log(`Checking positions for: ${addr}`);
    try {
        const positions = await fetchData(`https://data-api.polymarket.com/positions?user=${addr}`);
        console.log("Positions:", JSON.stringify(positions, null, 2));
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}
check();
