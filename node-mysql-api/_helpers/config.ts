// _helpers/config.ts  (new file)
const config = {
  database: {
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '3306'),
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'node_mysql_api',
  },
  secret:    process.env.JWT_SECRET   || 'SUPER_SECRET_KEY_REPLACE_ME_IN_PRODUCTION',
  emailFrom: process.env.EMAIL_FROM   || 'noreply@yourdomain.com',
  smtpOptions: {
    host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    }
  }
};
export default config;