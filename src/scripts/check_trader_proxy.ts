import fetchData from '../utils/fetchData.js';
async function check() {
    const addr = '0xb54101496b7078873447869c1804b2f85a3d1852';
    const u = await fetchData(`https://data-api.polymarket.com/user?address=${addr}`);
    console.log('Profile:', JSON.stringify(u, null, 2));
}
check();
