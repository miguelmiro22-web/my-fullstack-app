import nodemailer from 'nodemailer';

export default async function sendEmail({ to, subject, html, from = process.env.EMAIL_FROM }: any) {
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
            port: 465,
            secure: true,   // <-- add this line
            auth: {
                user: process.env.SMTP_USER || '',
                pass: process.env.SMTP_PASS || '',
            },
            tls: { rejectUnauthorized: false }
        });
    await transporter.sendMail({ from, to, subject, html });
}
