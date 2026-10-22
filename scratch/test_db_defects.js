const sql = require('mssql');
(async () => {
  try {
    const config = {
      user: 'sa',
      password: 'Password123!',
      server: '192.168.2.214',
      database: 'IIT_DB',
      options: { encrypt: false, trustServerCertificate: true }
    };
    await sql.connect(config);
    const defects = await sql.query('SELECT TOP 5 * FROM T_PER2_IPO_Defect ORDER BY id DESC');
    console.log('DEFECTS:', JSON.stringify(defects.recordset, null, 2));
    const heads = await sql.query('SELECT TOP 5 * FROM T_PER2_IPO_Head ORDER BY id DESC');
    console.log('HEADS:', JSON.stringify(heads.recordset, null, 2));
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
