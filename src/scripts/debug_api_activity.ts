import axios from 'axios';
async function check() {
    const addr = '0xb54101496b7078873447869c1804b2f85a3d1852';
    const url = `https://data-api.polymarket.com/activity?user=${addr}&type=TRADE`;
    try {
        const res = await axios.get(url, { timeout: 10000 });
        console.log("Recent Trades from API:");
        res.data.slice(0, 5).forEach((t: any) => {
            console.log(`[${new Date(t.timestamp * 1000).toLocaleString()}] ${t.title || t.slug}`);
        });
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}
check();
