const sqlite3 = require('/var/www/licensing-server/node_modules/sqlite3');
const db = new sqlite3.Database('/var/www/licensing-server/licenses.db');
db.all("SELECT license_key, requested_slug, wireguard_ip, custom_domain, product_id, local_port, is_active FROM licenses", [], (err, rows) => {
  if (err) {
    console.error(err);
  } else {
    console.log(JSON.stringify(rows, null, 2));
  }
  db.close();
});
