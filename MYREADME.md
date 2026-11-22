# Dataset Unlock

Dataset Unlock is a browser-based application for previewing and purchasing encrypted CSV datasets using Fiber Testnet.

Sellers select a CSV file, add a title and description, and create an encrypted offer. Buyers see a free preview before paying a 1 CKB Testnet invoice. After successful payment, the application retrieves the payment preimage, uses it to decrypt the dataset, and enables a CSV download.

## Changes from the starter

The original starter demonstrates payment-gated decryption of text. I adapted it into a CSV dataset purchasing application by adding:

- Local CSV file selection with a 1 MiB size limit.
- CSV parsing using Papa Parse, including support for quoted values.
- Validation of column names and consistent row widths.
- Seller-provided dataset titles and descriptions.
- Automatically generated previews containing column names, total data row count, and the first two data rows.
- Runtime validation of public preview metadata.
- Validation of decrypted dataset content before download.
- CSV downloads using browser Blob URLs.
- Readiness messages explaining why offer creation is unavailable.
- Collapsible offer JSON, improved table styling, and responsive form layouts.
- Reset behavior that supports starting another offer after a completed payment.

The starter’s encryption, invoice validation, payment tracking, and recovery mechanisms remain central to the application.

## How it works

1. The seller selects a CSV file.
2. The browser reads and parses the file locally.
3. The application generates a public preview.
4. The complete CSV and its download filename are serialized as JSON.
5. The application encrypts that JSON using AES-256-GCM.
6. A Fiber Testnet invoice is created using the encryption key as its payment preimage.
7. The seller shares the offer JSON containing the public preview, ciphertext, invoice, and routing information.
8. The buyer validates the offer and pays the invoice.
9. After successful payment, the application retrieves the payment preimage and uses it to decrypt the content.
10. The buyer can view and download the complete CSV.

The public offer does not include the plaintext full dataset or its decryption key.

## Requirements

- Node.js 22.18 or newer.
- npm.
- A browser supporting the starter’s WebAssembly runtime requirements.
- Network access for Fiber Testnet and CKB Testnet services.
- Testnet CKB for channel funding and payments.

Use localhost or HTTPS. The browser runtime requires a secure context and cross-origin isolation. The project’s Next.js configuration supplies the required isolation headers.

## Run locally

```sh
npm install
npm run dev
```

Open:

```text
http://localhost:3001
```

## Demo walkthrough

### Prepare the nodes(Instructions)

1. Start the buyer and seller nodes.
2. Fund their displayed addresses with Testnet CKB if needed.
3. Open or reconnect their channels.
4. Refresh channel status until both report CHANNEL_READY.
5. Confirm both nodes are connected and have sufficient channel liquidity.

The starter’s 5 CKB liquidity transfer is optional when the existing balances already support the purchase.

### Create an offer

1. Enter a dataset title and description.
2. Select a valid comma-separated CSV file.
3. Review the column names, row count, and public sample rows.
4. Click **Encrypt & create 1 CKB Invoice**.
5. Copy the generated offer JSON.

### Purchase and unlock

1. Paste the offer JSON into the buyer’s import area.
2. Click **Validate offer**.
3. Review the public dataset preview.
4. Click **Decrypt without key** to demonstrate that the content remains locked.
5. Click **Pay 1 CKB**.
6. If necessary, use **Check payment status** to retrieve the result.
7. After successful payment, click **Decrypt with revealed key**.
8. Click **Download CSV**.

The current application downloads the unlocked file as `dataset.csv`.

## Recovery after refresh

The application preserves the offer and payment attempt information needed to recover a purchase.

After refreshing:

1. Start the same saved nodes.
2. Reconnect them if necessary.
3. Validate the restored offer.
4. Click **Check payment status**.
5. Recover the revealed key and decrypt the dataset again.

A successfully recovered purchase does not require another payment.

Do not clear browser storage to troubleshoot a pending payment. Browser storage contains node identities, and clearing it can lose access to funded channels.

## Project structure

- `app/page.tsx`: seller and buyer interface, file selection, purchase flow, and downloads.
- `app/globals.css`: application styling and responsive layout.
- `lib/csv.ts`: CSV parsing, validation, and preview generation.
- `lib/dataset.ts`: dataset types and decrypted-content validation.
- `lib/offer.ts`: encrypted offer creation and parsing.
- `lib/crypto.ts`: AES-GCM encryption and decryption.
- `lib/payment.ts`: invoice validation and payment handling.
- `lib/progress.ts`: saved offer and payment progress.
- `lib/node-session.ts`: browser node session management.

## Validation

Run:

```sh
npm run typecheck
npm test
npm run build
```

I also manually verified:

- Selecting and parsing a CSV.
- Displaying two public sample rows.
- Rejecting decryption without the correct key.
- Successful Fiber Testnet payment.
- Decrypting the full selected dataset.
- Downloading the unlocked CSV.
- Recovering a completed purchase after refresh without paying again.

## Limitations

- This is a Testnet demonstration.
- The purchase price is fixed at 1 CKB, with routing fees shown separately.
- CSV files are limited to 1 MiB.
- Files must have a header and at least one data row.
- The parser expects comma-separated input.
- Preview validation supports up to 50 columns and limits preview cell lengths.
- The first two data rows are public. Files with two or fewer data rows expose all their data in the preview.
- Offer sharing uses manual JSON copy and paste.
- The full encrypted dataset is included in the offer JSON.
- Validation does not prove dataset quality, seller ownership, or the accuracy of the seller’s description.
- Buyers can share the content after unlocking it.
- No application backend is required, but Fiber and CKB network services are still needed.

## Demo

[Kindly click the link for Demo screenshot and videos](https://drive.google.com/drive/folders/1PALrE62kyYu4ONKKO80-hSFEOiWMYJuc?usp=sharing)

The demonstration shows CSV selection, public preview, encrypted offer creation, rejected decryption without a key, successful payment, decryption, and download.

## Acknowledgements

Built from the Fiber encrypted-data-payment starter.

- Tutorial: https://www.fiber.world/docs/build/encrypted-data-payment
- CSV parser: https://www.papaparse.com/