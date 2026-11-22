"use client";

import { channelFundingGuidance } from "../lib/channel-funding";
import { useEffect, useRef, useState } from "react";
import {
  scriptToAddress,
  type Channel,
  type FiberBrowserNode,
  type GetPaymentResult,
} from "@fiber-pay/sdk/browser";
import { decryptResult, toHex } from "../lib/crypto";
import {
  bottle,
  channelFundingCkb,
  connectAndOpenChannel,
  readChannel,
  ready,
  startRole,
} from "../lib/fiber";
import { createOffer, parseOffer, type EncryptedOffer } from "../lib/offer";
import { payForOffer, validateOffer } from "../lib/payment";
import { createBrowserNodeSession } from "../lib/node-session";
import {
  encryptedSessionKey,
  encryptedBuyerProfile,
  encryptedSellerProfile,
  savedNodeIdentifier,
  readEncryptedProgress,
  type EncryptedLessonProgress,
} from "../lib/progress";
// Changes from me
import {
  /* demoContent,
  demoPreview,*/
  parseDatasetContent,
  type DatasetContent,
  type DatasetPreview,
} from "../lib/dataset";
// Changes from me
import { summarizeCsv, type CsvSummary } from "../lib/csv";

type Role = "buyer" | "seller";
const ckb = (value: string) => `${Number(BigInt(value)) / 100_000_000}`;
//const sample =
// "Fiber Testnet report\n\nPayment settled. The encrypted result is readable.";

export default function Page() {
  const nodes = useRef<Partial<Record<Role, FiberBrowserNode>>>({});
  const sessions = useRef<
    Partial<Record<Role, ReturnType<typeof createBrowserNodeSession>>>
  >({});
  const progress = useRef<EncryptedLessonProgress | null>(null);
  const locked = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addresses, setAddresses] = useState<Partial<Record<Role, string>>>({});
  const [connected, setConnected] = useState<Partial<Record<Role, boolean>>>(
    {},
  );
  const [channels, setChannels] = useState<Partial<Record<Role, Channel>>>({});
  //const [plaintext, setPlaintext] = useState(sample);
  const [generated, setGenerated] = useState("");
  const [received, setReceived] = useState("");
  const [offer, setOffer] = useState<EncryptedOffer | null>(null);
  const [attempt, setAttempt] = useState("");
  const [tested, setTested] = useState(false);
  const [payment, setPayment] = useState<GetPaymentResult | null>(null);
  const [key, setKey] = useState("");
  const [decrypted, setDecrypted] = useState("");
  // Changes from me
  const [dataset, setDataset] = useState<DatasetContent | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const [selectedFile, setSelectedFile] = useState<{
    filename: string;
    csv: string;
  } | null>(null);

  const [readingFile, setReadingFile] = useState(false);
  const [csvSummary, setCsvSummary] = useState<CsvSummary | null>(null);
  const [datasetTitle, setDatasetTitle] = useState("");
  const [datasetDescription, setDatasetDescription] = useState(""); // stop here

  useEffect(() => {
    const saved = readEncryptedProgress(sessionStorage, localStorage);
    progress.current = saved;
    if (saved) {
      setGenerated(saved.generatedOffer);
      setReceived(saved.buyerOfferText);
      setAttempt(saved.attemptedPaymentHash);
      setTested(saved.triedWithoutKey);
    }
    setLoaded(true);
    const owned = sessions.current;
    const stop = () => {
      for (const session of Object.values(owned))
        void session.stop().catch(() => {});
    };
    window.addEventListener("pagehide", stop);
    return () => {
      window.removeEventListener("pagehide", stop);
      stop();
      nodes.current = {};
      sessions.current = {};
    };
  }, []);

  function save(update: Partial<EncryptedLessonProgress>) {
    const buyerId = savedNodeIdentifier(localStorage, encryptedBuyerProfile);
    const sellerId = savedNodeIdentifier(localStorage, encryptedSellerProfile);
    if (!buyerId || !sellerId)
      throw new Error("Start both saved nodes before continuing.");
    const next = {
      version: 1 as const,
      buyerId,
      sellerId,
      generatedOffer: "",
      buyerOfferText: "",
      attemptedPaymentHash: "",
      triedWithoutKey: false,
      ...progress.current,
      ...update,
    };
    sessionStorage.setItem(encryptedSessionKey, JSON.stringify(next));
    progress.current = next;
  }

  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Action failed. Check status before retrying a transfer.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  async function refresh(role: Role) {
    const node = nodes.current[role];
    if (!node) return;
    const channel = await readChannel(node);
    const { peers } = await node.listPeers();
    setConnected((previous) => ({
      ...previous,
      [role]: peers.some(
        (peer) =>
          peer.pubkey.replace(/^0x/i, "").toLowerCase() ===
          bottle.pubkey.slice(2),
      ),
    }));
    setChannels((previous) => ({ ...previous, [role]: channel }));
  }

  async function start(role: Role) {
    if (nodes.current[role]) return;
    const session = (sessions.current[role] ??= createBrowserNodeSession());
    let started: FiberBrowserNode | undefined;
    await session.start(
      role === "buyer" ? encryptedBuyerProfile : encryptedSellerProfile,
      async (track) => {
        started = await startRole(role, track);
      },
    );
    if (!started) return;
    nodes.current[role] = started;
    const info = await started.nodeInfo();
    setAddresses((previous) => ({
      ...previous,
      [role]: scriptToAddress(info.default_funding_lock_script, "testnet"),
    }));
    if (await readChannel(started)) await started.connectPeer(bottle);
    await refresh(role);
  }

  async function open(role: Role) {
    const node = nodes.current[role];
    if (!node) return;
    const channel = await connectAndOpenChannel(node);
    setChannels((previous) => ({ ...previous, [role]: channel }));
    await refresh(role);
    setStatus(
      channel && ready(channel)
        ? "Channel ready."
        : "Opening submitted. Check channel status after confirmation.",
    );
  }

  async function moveLiquidity() {
    const node = nodes.current.seller;
    if (!node) return;
    const id = savedNodeIdentifier(localStorage, encryptedSellerProfile);
    const storageKey = `fiber-docs:encrypted-inbound:${id}`;
    const existing = sessionStorage.getItem(storageKey);
    if (existing === "submitting")
      throw new Error(
        "Transfer outcome unknown. Review payment history before sending again.",
      );
    let result: GetPaymentResult;
    if (existing)
      result = await node.getPayment({
        payment_hash: existing as `0x${string}`,
      });
    else {
      sessionStorage.setItem(storageKey, "submitting");
      result = await node.sendPayment({
        target_pubkey: bottle.pubkey,
        amount: "0x1dcd65000",
        keysend: true,
      });
      sessionStorage.setItem(storageKey, result.payment_hash);
    }
    if (!["Success", "Failed"].includes(result.status))
      result = await node.waitForPayment(result.payment_hash, {
        timeout: 60_000,
        interval: 1_000,
      });
    if (result.status === "Failed") sessionStorage.removeItem(storageKey);
    setStatus(`Liquidity transfer: ${result.status}`);
    await refresh("seller");
  }

  /* async function makeOffer() {
    if (
      !nodes.current.seller ||
      !channels.seller ||
      !routeReady ||
      generated ||
      attempt
    )
      return;
    {
    }
    const contentJson = JSON.stringify(demoContent);
    const value = await createOffer(
      nodes.current.seller,
      channels.seller,
      contentJson,
      demoPreview,
    );
    save({ generatedOffer: value });
    setGenerated(value);
    setStatus("Invoice created.");
  }*/

  // Changes from me
  async function makeOffer() {
    if (
      !nodes.current.seller ||
      !channels.seller ||
      !routeReady ||
      generated ||
      attempt ||
      readingFile
    ) {
      return;
    }

    if (!selectedFile || !csvSummary) {
      throw new Error("Select a valid CSV file first.");
    }

    const title = datasetTitle.trim();
    const description = datasetDescription.trim();

    if (!title || !description) {
      throw new Error("Enter a dataset title and description.");
    }

    const content: DatasetContent = {
      filename: "dataset.csv",
      csv: selectedFile.csv,
    };

    const preview: DatasetPreview = {
      title,
      description,
      columns: csvSummary.columns,
      sampleRows: csvSummary.sampleRows,
      rowCount: csvSummary.rowCount,
    };

    const value = await createOffer(
      nodes.current.seller,
      channels.seller,
      JSON.stringify(content),
      preview,
    );

    save({ generatedOffer: value });
    setGenerated(value);
    setStatus("Dataset encrypted and invoice created.");
  }

  async function validate() {
    if (!nodes.current.buyer) return;
    const parsed = parseOffer(received);
    await validateOffer(nodes.current.buyer, parsed);
    if (attempt && parsed.paymentHash.toLowerCase() !== attempt.toLowerCase())
      throw new Error("Restore the offer for the previous payment.");
    save({ buyerOfferText: received });
    setOffer(parsed);
    setStatus("Offer validated.");
  }

  async function testLock() {
    if (!offer) return;
    try {
      await decryptResult(
        offer,
        toHex(crypto.getRandomValues(new Uint8Array(32))),
      );
    } catch {
      save({ triedWithoutKey: true });
      setTested(true);
      setStatus("Decryption rejected: key unavailable.");
    }
  }

  async function pay() {
    if (!nodes.current.buyer || !offer || !tested || !routeReady) return;

    {
      /* Changes from me */
    }
    setStatus("Submitting payment. Waiting for payment status…"); // Stop here

    const result = await payForOffer(
      nodes.current.buyer,
      offer,
      attempt,
      (hash) => {
        save({ attemptedPaymentHash: hash });
        setAttempt(hash);
      },
      payment?.status === "Failed",
    );
    acceptPayment(result);
    await Promise.all([refresh("buyer"), refresh("seller")]);
  }

  function acceptPayment(result: GetPaymentResult) {
    setPayment(result);
    setStatus(`Payment: ${result.status}`);
    if (result.status === "Failed")
      setError(
        result.failed_error ??
          "Payment failed. Check channel liquidity before retrying.",
      );
    if (result.status === "Success" && result.payment_preimage)
      setKey(result.payment_preimage);
  }

  async function checkPayment() {
    if (!nodes.current.buyer || !offer || !attempt) return;
    await validateOffer(nodes.current.buyer, offer);
    acceptPayment(
      await nodes.current.buyer.getPayment({
        payment_hash: attempt as `0x${string}`,
      }),
    );
  }

  function startAnotherOffer() {
    //if (busy || (attempt && payment?.status !== "Failed")) return;
    // Changes from me
    if (
      busy ||
      (attempt && payment?.status !== "Failed" && payment?.status !== "Success")
    ) {
      return;
    } // Stop here
    save({
      generatedOffer: "",
      buyerOfferText: "",
      attemptedPaymentHash: "",
      triedWithoutKey: false,
      completedSteps: [],
    });
    setGenerated("");
    setReceived("");
    setOffer(null);
    setAttempt("");
    setTested(false);
    setPayment(null);
    setKey("");
    setDecrypted("");
    setError("");
    setStatus("Create a fresh encrypted offer.");
    /* Changes from me */
    setDataset(null);
    setSelectedFile(null);
    setCsvSummary(null);
    setDatasetTitle("");
    setDatasetDescription(""); // Stop here
  }

  const routeReady = Boolean(
    connected.buyer &&
    connected.seller &&
    channels.buyer &&
    ready(channels.buyer) &&
    BigInt(channels.buyer.local_balance) >= 100_000_000n &&
    channels.seller &&
    ready(channels.seller) &&
    BigInt(channels.seller.remote_balance) >= 100_000_000n,
  );
  const canSubmit = Boolean(
    offer &&
    tested &&
    routeReady &&
    !key &&
    (!attempt || payment?.status === "Failed"),
  );

  // Changes from me
  const offerBlockReason = busy
    ? "An action is in progress."
    : readingFile
      ? "Reading your CSV file."
      : generated
        ? "An offer already exists. Complete this purchase or start another offer."
        : attempt
          ? "Resolve the existing payment before creating another offer."
          : !connected.buyer || !connected.seller
            ? "Start both nodes and reconnect them to the routing peer."
            : !routeReady
              ? "Check both channels are ready and have enough payment liquidity."
              : !datasetTitle.trim()
                ? "Enter a dataset title."
                : !datasetDescription.trim()
                  ? "Enter a dataset description."
                  : !selectedFile || !csvSummary
                    ? "Select a valid CSV file."
                    : "";

  function downloadDataset() {
    if (!dataset) return;

    const blob = new Blob([dataset.csv], {
      type: "text/csv;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = dataset.filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  async function readDatasetFile(file: File) {
    setSelectedFile(null);
    setCsvSummary(null);
    setReadingFile(true);

    try {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        throw new Error("Choose a CSV file.");
      }

      if (file.size > 1024 * 1024) {
        throw new Error("Choose a CSV file smaller than or equal to 1 MiB.");
      }

      const csv = await file.text();

      if (!csv.trim()) {
        throw new Error("The selected file is empty.");
      }

      const summary = summarizeCsv(csv);
      setCsvSummary(summary);

      setSelectedFile({
        filename: file.name,
        csv,
      });

      // Changes from me
      setStatus(`Selected ${file.name}. CSV preview is ready.`); // Stop here
    } finally {
      setReadingFile(false);
    }
  } // Stop here

  return (
    <main>
      <p className="eyebrow">Fiber Testnet</p>
      {/* <h1>Pay to decrypt</h1> */}
      {/* Changes from me */}
      <h1>Dataset Unlock</h1>
      <p>
        Preview a dataset, pay with Fiber Testnet, and unlock the complete CSV.
      </p>
      {/* Stop here */}
      {status && (
        <p className="status" role="status">
          {status}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="grid">
        {(["buyer", "seller"] as const).map((role) => (
          <section className="card" key={role}>
            <h2>{role === "buyer" ? "Buyer A" : "Seller C"}</h2>
            {!addresses[role] && (
              <button
                disabled={!loaded || busy}
                onClick={() => void run(() => start(role))}
              >
                Start node
              </button>
            )}
            {addresses[role] && (
              <>
                <code>{addresses[role]}</code>
                <a
                  href="https://faucet.nervos.org"
                  target="_blank"
                  rel="noreferrer"
                >
                  Get Testnet CKB ↗
                </a>
                {!channels[role] && <p>{channelFundingGuidance}</p>}
                <button
                  disabled={busy}
                  onClick={() => void run(() => open(role))}
                >
                  {channels[role]
                    ? "Reconnect / check channel"
                    : `Open ${channelFundingCkb} CKB channel`}
                </button>
                <button
                  disabled={busy}
                  onClick={() => void run(() => refresh(role))}
                >
                  Refresh channel status
                </button>
              </>
            )}
            {channels[role] && (
              <>
                <code>{channels[role].state.state_name}</code>
                <p>
                  {role}: {ckb(channels[role].local_balance)} CKB · Bottle:{" "}
                  {ckb(channels[role].remote_balance)} CKB
                </p>
              </>
            )}
          </section>
        ))}
      </div>
      <section className="card">
        <h2>Liquidity</h2>
        <button
          disabled={
            busy ||
            !channels.seller ||
            !ready(channels.seller) ||
            BigInt(channels.seller.local_balance) < 500_000_000n
          }
          onClick={() => void run(moveLiquidity)}
        >
          Send / check 5 CKB transfer
        </button>
      </section>
      <div className="grid exchange">
        <section className="card">
          <h2>Seller</h2>
          {/*<textarea
            aria-label="Seller result"
            disabled={busy || Boolean(generated)}
            value={plaintext}
            onChange={(e) => setPlaintext(e.target.value)}
          />*/}
          {/* Changes from me */}
          <label>
            Dataset title:{" "}
            <input
              type="text"
              maxLength={120}
              value={datasetTitle}
              disabled={busy || Boolean(generated)}
              onChange={(event) => setDatasetTitle(event.target.value)}
            />
          </label>

          <label>
            Dataset description
            <textarea
              maxLength={1000}
              value={datasetDescription}
              disabled={busy || Boolean(generated)}
              onChange={(event) => setDatasetDescription(event.target.value)}
            />
          </label>

          <label>
            Choose a CSV dataset
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={busy || readingFile || Boolean(generated)}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];

                event.currentTarget.value = "";

                if (file) {
                  void run(() => readDatasetFile(file));
                }
              }}
            />
          </label>
          {readingFile && <p>Reading dataset…</p>}
          {selectedFile && <p>Selected: {selectedFile.filename}</p>}
          <p>
            The first two data rows will be public. The complete CSV will be
            encrypted.
          </p>
          {csvSummary && (
            <div>
              <p>
                {csvSummary.rowCount} data rows · {csvSummary.columns.length}{" "}
                columns
              </p>

              <p>Columns: {csvSummary.columns.join(", ")}</p>

              <p>These sample rows will be public:</p>

              <pre>{JSON.stringify(csvSummary.sampleRows, null, 2)}</pre>
            </div>
          )}
          <p role="status">
            {offerBlockReason ||
              "Your dataset is ready. Create an encrypted offer to continue."}
          </p>
          {/* Stop here */}
          <button
            /*
            disabled={
              busy ||
              !routeReady ||
              //!plaintext.trim() ||
              Boolean(generated || attempt)
            }*/
            // Changes from me
            disabled={Boolean(offerBlockReason)}
            // Stop here
            onClick={() => void run(makeOffer)}
          >
            Encrypt & create 1 CKB Invoice
          </button>
          {/*<textarea aria-label="Generated offer" readOnly value={generated} />*/}
          {/* Changes from me */}
          {generated && (
            <details>
              <summary>View encrypted offer JSON</summary>
              <textarea
                aria-label="Generated offer"
                readOnly
                value={generated}
                rows={8}
              />
            </details>
          )}{/* Stop here */}
          <button
            disabled={!generated || busy}
            onClick={() =>
              void run(async () => {
                await navigator.clipboard.writeText(generated);
                setStatus("Offer copied.");
              })
            }
          >
            Copy offer
          </button>
        </section>
        <section className="card">
          <h2>Buyer</h2>
          <details open={!offer}>
            <summary>Import encrypted offer JSON</summary>
            <textarea
              aria-label="Received offer"
              disabled={busy || Boolean(offer || attempt)}
              value={received}
              onChange={(e) => {
                setReceived(e.target.value);
                setTested(false);
              }}
            />
          </details>
          <button
            disabled={busy || !received || !addresses.buyer || Boolean(offer)}
            onClick={() => void run(validate)}
          >
            Validate offer
          </button>

          {/* Display the offer preview if available - changes from me */}
          {offer && (
            <section>
              <h3>{offer.preview.title}</h3>
              <p>{offer.preview.description}</p>

              <p>
                {offer.preview.rowCount} total rows. Showing{" "}
                {offer.preview.sampleRows.length} sample rows.
              </p>

              <div style={{ overflowX: "auto" }}>
                <table>
                  <caption>Free dataset preview</caption>

                  <thead>
                    <tr>
                      {offer.preview.columns.map((column, index) => (
                        <th key={index} scope="col">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {offer.preview.sampleRows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p>Pay the invoice to unlock the complete CSV.</p>
            </section>
          )}
          {/* Stop here */}

          {!tested && (
            <button
              disabled={busy || !offer}
              onClick={() => void run(testLock)}
            >
              Decrypt without key
            </button>
          )}
          {canSubmit && (
            <button disabled={busy} onClick={() => void run(pay)}>
              {attempt ? "Retry failed payment" : "Pay 1 CKB"}
            </button>
          )}
          {attempt && !key && (
            <button
              disabled={busy || !offer || !addresses.buyer}
              onClick={() => void run(checkPayment)}
            >
              Check payment status
            </button>
          )}
          <button
            disabled={busy || !offer || !key || Boolean(decrypted)}
            // Changes from me
            onClick={() =>
              void run(async () => {
                if (!offer || !key) return;

                const plaintext = await decryptResult(offer, key);
                const content = parseDatasetContent(plaintext);

                setDataset(content);
                setDecrypted(plaintext);
              })
            }
          >
            Decrypt with revealed key
          </button>
        </section>
      </div>
      {payment?.status === "Success" && (
        <section className="card">
          <h2>Receipt</h2>
          <p>
            Amount: 1 CKB · Fee: {ckb(payment.fee)} CKB · Total:{" "}
            {ckb(`0x${(100_000_000n + BigInt(payment.fee)).toString(16)}`)} CKB
          </p>
          <code>{payment.payment_hash}</code>
        </section>
      )}

      {/* Changes from me */}
      {dataset && (
        <section className="result">
          <h2>Dataset unlocked</h2>

          <p>{dataset.filename}</p>

          <button onClick={downloadDataset}>Download CSV</button>

          <pre>{dataset.csv}</pre>
        </section>
      )}
      {/*decrypted && (
        <section className="result">
          <h2>Decrypted result</h2>
          <pre>{decrypted}</pre>
        </section>
      )*/}
      {/*(generated || received) &&
        (!attempt || payment?.status === "Failed") && (
          <button
            disabled={busy}
            onClick={() => void run(async () => startAnotherOffer())}
          >
            Start another offer
          </button>
        )*/}

      {/* Changes from me */}
      {(generated || received) &&
        (!attempt ||
          payment?.status === "Failed" ||
          payment?.status === "Success") && (
          <button disabled={busy} onClick={startAnotherOffer}>
            Start another offer
          </button>
        )}
    </main>
  );
}
