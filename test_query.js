const { Client } = require('/var/www/project-absenta/absenta_backend/node_modules/pg');
const client = new Client({
  connectionString: 'postgresql://postgres:123123123@localhost:5432/smk6jkt'
});

client.connect()
  .then(() => client.query('SELECT id, tahun, is_active FROM "TahunPelajaran"'))
  .then(res => {
    console.log('Tahun Pelajaran Rows:');
    console.log(JSON.stringify(res.rows, null, 2));
  })
  .catch(err => console.error(err))
  .finally(() => client.end());
