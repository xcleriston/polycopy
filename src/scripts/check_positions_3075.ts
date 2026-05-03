import fetchData from '../utils/fetchData.js';
async function check() {
    const addr = '0x3075a90F9bdAC075EBb018b074a69E7f5B98D8D6';
    const p = await fetchData(`https://data-api.polymarket.com/positions?user=${addr}`);
    console.log(JSON.stringify(p, null, 2));
}
check();
