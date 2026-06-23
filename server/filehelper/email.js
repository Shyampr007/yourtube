import nodemailer from "nodemailer";

/**
 * Sends a transaction confirmation invoice email to the user.
 * Dynamically falls back to Ethereal Mail if no SMTP config is found.
 */
export const sendInvoiceEmail = async (recipientEmail, userName, planDetails) => {
  const { planType, amount, orderId, transactionId } = planDetails;

  // Read configurations from env, or default to mock fallback behavior
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT || 587;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  let transporter;
  let usingTestAccount = false;

  try {
    if (smtpHost && smtpUser && smtpPass) {
      console.log("Using custom SMTP configuration for email delivery...");
      transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort.toString(), 10),
        secure: Number(process.env.SMTP_PORT) === 465, // true for port 465, false for other ports
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });
    } else {
      console.log("No SMTP configuration found. Creating a temporary Ethereal test mail account...");
      const testAccount = await nodemailer.createTestAccount();
      usingTestAccount = true;
      transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false, // true for port 465, false for other ports
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    }

    const invoiceNumber = "INV-" + Date.now().toString().slice(-6);
    const billingDate = new Date().toLocaleDateString("en-IN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const mailOptions = {
      from: smtpUser ? `"YourTube Premium" <${smtpUser}>` : '"YourTube Billing" <billing@yourtube.com>',
      to: recipientEmail,
      subject: `Invoice for YourTube ${planType} Plan Upgrade - ${invoiceNumber}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>YourTube Plan Upgrade Invoice</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px border #e5e7eb; }
            .header { background: linear-gradient(135deg, #7c3aed, #4f46e5); color: #ffffff; padding: 32px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
            .header p { margin: 8px 0 0; opacity: 0.9; font-size: 14px; }
            .badge { display: inline-block; background-color: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: #ffffff; font-size: 11px; font-weight: bold; padding: 4px 12px; border-radius: 20px; text-transform: uppercase; margin-top: 12px; }
            .content { padding: 32px; color: #1f2937; }
            .intro h2 { font-size: 20px; font-weight: 600; margin: 0 0 8px; color: #111827; }
            .intro p { margin: 0 0 24px; font-size: 14px; color: #4b5563; line-height: 1.5; }
            .invoice-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
            .invoice-table th { text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #6b7280; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb; }
            .invoice-table td { padding: 12px 0; font-size: 14px; border-bottom: 1px solid #f3f4f6; color: #374151; }
            .invoice-table td.amount { text-align: right; font-weight: 600; color: #111827; }
            .invoice-details { background-color: #f9fafb; border-radius: 12px; padding: 20px; margin-bottom: 24px; border: 1px solid #f3f4f6; }
            .invoice-details table { width: 100%; font-size: 13px; }
            .invoice-details td { padding: 4px 0; color: #4b5563; }
            .invoice-details td.label { font-weight: 500; color: #111827; }
            .invoice-details td.val { text-align: right; }
            .total-row { font-size: 16px; font-weight: bold; border-top: 2px solid #e5e7eb; padding-top: 16px; margin-top: 16px; display: flex; justify-content: space-between; color: #111827; }
            .footer { background-color: #f9fafb; padding: 24px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; }
            .footer a { color: #4f46e5; text-decoration: none; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Invoice Upgrade Confirmation</h1>
              <p>YourTube Premium Tier Upgrade Services</p>
              <span class="badge">${planType} Plan</span>
            </div>
            <div class="content">
              <div class="intro">
                <h2>Hi ${userName || "Subscriber"},</h2>
                <p>Thank you for upgrading! Your subscription payment was verified successfully. Your plan limits have been instantly adjusted on the platform.</p>
              </div>
              <table class="invoice-table">
                <thead>
                  <tr>
                    <th>Item Description</th>
                    <th style="text-align: right;">Price</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>YourTube Plan Upgrade (${planType} Subscription)</td>
                    <td class="amount">₹${(amount / 100).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>

              <div class="invoice-details">
                <table>
                  <tr>
                    <td class="label">Invoice Number</td>
                    <td class="val">${invoiceNumber}</td>
                  </tr>
                  <tr>
                    <td class="label">Billing Date</td>
                    <td class="val">${billingDate}</td>
                  </tr>
                  <tr>
                    <td class="label">Order ID</td>
                    <td class="val">${orderId || "N/A"}</td>
                  </tr>
                  <tr>
                    <td class="label">Transaction Reference</td>
                    <td class="val">${transactionId || "tx_mock_" + Date.now().toString().slice(-6)}</td>
                  </tr>
                  <tr>
                    <td class="label">Payment Status</td>
                    <td class="val" style="color: #059669; font-weight: bold;">PAID (Success)</td>
                  </tr>
                </table>
                <div class="total-row">
                  <span>Total Paid</span>
                  <span>₹${(amount / 100).toFixed(2)}</span>
                </div>
              </div>
            </div>
            <div class="footer">
              <p>This is a payment receipt for YourTube. If you have questions, please reach out to <a href="mailto:support@yourtube.com">support@yourtube.com</a>.</p>
              <p style="margin-top: 12px; font-size: 11px; color: #9ca3af;">&copy; 2026 YourTube. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Invoice email sent successfully to ${recipientEmail}. Message ID: ${info.messageId}`);

    if (usingTestAccount) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log("\n==================================================");
      console.log("  TEST EMAIL SENT TO ETHEREAL MAIL");
      console.log(`  Recipient: ${recipientEmail}`);
      console.log(`  Preview URL: ${previewUrl}`);
      console.log("==================================================\n");
    }
    return info;
  } catch (error) {
    console.error("Failed to send transaction confirmation invoice email:", error);
  }
};

/**
 * Sends a region-based 6-digit OTP verification email to the user.
 */
export const sendOtpEmail = async (recipientEmail, userName, otp) => {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || 465);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  try {
    console.log("======================================");
    console.log("Starting OTP Email Service");
    console.log("SMTP Host:", smtpHost);
    console.log("SMTP Port:", smtpPort);
    console.log("SMTP User:", smtpUser);
    console.log("Recipient:", recipientEmail);
    console.log("======================================");

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.verify();
    console.log("✅ SMTP Connected Successfully");

    const mailOptions = {
      from: `"YourTube Security" <${smtpUser}>`,
      to: recipientEmail,
      subject: `Your OTP Verification Code: ${otp}`,
      html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>YourTube OTP Verification</title>
      </head>
      <body style="font-family: Arial, sans-serif; background:#f3f4f6; padding:20px;">
        <div style="max-width:500px;margin:auto;background:#fff;border-radius:10px;padding:30px;">
          <h2 style="color:#4f46e5;">YourTube Verification</h2>

          <p>Hello ${userName || "User"},</p>

          <p>Your OTP code is:</p>

          <div style="
            font-size:32px;
            font-weight:bold;
            text-align:center;
            padding:15px;
            margin:20px 0;
            background:#f5f5f5;
            border:2px dashed #4f46e5;
            border-radius:8px;
            letter-spacing:5px;
          ">
            ${otp}
          </div>

          <p>This OTP is valid for 10 minutes.</p>

          <p>If you didn't request this OTP, ignore this email.</p>

          <hr>

          <p style="font-size:12px;color:gray;">
            © 2026 YourTube Security
          </p>
        </div>
      </body>
      </html>
      `,
    };

    console.log("📧 Sending Email...");

    const info = await transporter.sendMail(mailOptions);

    console.log("✅ Email Sent Successfully");
    console.log("Message ID:", info.messageId);

    return info;
  } catch (error) {
    console.error("❌ Failed to send OTP verification email");
    console.error(error);
    throw error;
  }
};
