# AskThis Quick Start (Absolute Beginners)

> No programming knowledge needed. Ten minutes and you're set.

## 1. What is this?

AskThis is a **"select it, ask it"** tool: select text in **any application**, press one shortcut, and a small card appears next to your cursor with an AI explanation, translation or answer — with follow-ups when you need them.

Real examples:

- See a term you don't know on a webpage → select it → press the shortcut → instantly explained
- Reading a paper in a foreign language → select a paragraph → get a translation
- A piece of code you don't understand → select it → get a plain-language walkthrough
- Want to ask something yourself → press the shortcut with nothing selected and just type

It is not tied to any single AI company: you bring your own AI account (DeepSeek is a cheap and simple choice), and AskThis delivers the question and renders the answer.

## 2. Install

### macOS

1. Download from the [Releases page](https://github.com/537Lab/askthis/releases):
   - Apple silicon (M1/M2/M3/M4…) → `AskThis-0.1.0-arm64.dmg`
   - Intel Macs → `AskThis-0.1.0-x64.dmg`
2. Open the `.dmg` and drag **AskThis into your Applications folder**
3. First launch: in Applications, **right-click AskThis → Open → Open again**
   (AskThis is free open-source software without an Apple signing certificate — this is only needed once)
4. It will sit quietly in the **menu bar** (top-right) and open its Settings window automatically

### Windows

1. Download `AskThis-0.1.0-setup-x64.exe`
2. Double-click to install. If a blue "Windows protected your PC" screen appears, click **More info → Run anyway** (normal for unsigned open-source software)
3. AskThis starts and lives in the **system tray** (bottom-right), with Settings opening automatically

## 3. The key step: connect an AI service (get an API key)

AskThis has no AI of its own — it needs a "key" (**API key**) from an AI service you own.
**Recommended: DeepSeek** — simple sign-up, very cheap, works worldwide.

<details open>
<summary><b>Expand: getting an API key with DeepSeek</b></summary>

1. Go to <https://platform.deepseek.com> and sign up / log in
2. Top up a few dollars under **Top up / Billing** (a few dollars lasts a long time)
3. Open **API keys → Create API key**
4. Name it anything (e.g. "askthis") → **copy the key immediately** (it looks like `sk-xxxxxxxx` and is shown only once)
5. Back in AskThis → **Providers**:
   - Click the pre-created **DeepSeek** entry
   - Paste the key into **API key** → click **Save**
   - Click **Fetch models** and pick one (e.g. `DeepSeek-V4.1-Flash`)
6. Done — head to step 4

</details>

![Settings → Providers (active model, reasoning level, services)](images/settings.png)

<details>
<summary><b>Using another provider?</b></summary>

If you already pay for OpenAI, Claude, Kimi, GLM, SiliconFlow, etc.:

- Find the "API keys" page in that provider's console, create and copy a key
- In AskThis → Providers → **Add service**, choose your provider and paste the key
- Provider not listed? Choose **Custom (OpenAI-compatible)** and fill in the API base URL from its docs

</details>

## 4. First use

1. (macOS only) The first time you press the shortcut, macOS asks for **Accessibility** permission — this is how AskThis "sees" your selected text:
   - Click **Grant…** → tick **AskThis** in System Settings
   - Back in AskThis, click **Restart AskThis** (important: the grant takes effect after a restart)
2. Select some text in any app
3. Press the shortcut:
   - macOS: **⌥⇧D** (Option + Shift + D)
   - Windows: **Alt + Shift + D**
4. The card appears and the answer streams in

![The quick-look card: an answer for “LoG 算子（Laplacian of Gaussian）”](images/popup.png)

## 5. Everyday usage

| I want to… | How |
| --- | --- |
| Look up a word / passage | Select it → press the shortcut |
| Ask something myself | Press the shortcut with nothing selected → type → Enter |
| Follow up | Type in the card's input → Enter |
| Copy the answer | Click **Copy** (the card closes afterwards) |
| Close the card | `Esc`, or click **Close** |
| Change model / provider | Settings → Providers |
| Change the shortcut | Settings → Shortcut & Interaction |
| Change language / theme | Settings → General |

## 6. FAQ

**Q: The shortcut does nothing?**

- It may be taken by another app → Settings → Shortcut & Interaction → pick another combo
- macOS: check System Settings → Privacy & Security → Accessibility — is AskThis ticked? After ticking, click **Restart AskThis** in the settings page

**Q: "Request failed / timed out"?**

- Check your network; if you use a proxy app, enable its **system proxy** mode (AskThis follows the system proxy automatically)
- Verify the API key and that your AI account has balance

**Q: The card says "No API key configured"?**

- Go back to step 3 and save your key in Settings

**Q: Will this cost a lot?**

- Each lookup typically costs a fraction of a cent; a few dollars on DeepSeek lasts a long time
- To spend even less: Settings → Providers → lower **Max output tokens**

**Q: Where does my text go?**

- Only to the AI service **you** configured. AskThis collects nothing — no account, no analytics, no telemetry

**Q: I can't find the window!**

- AskThis deliberately has no main window:
  - macOS: look for its small icon in the **menu bar** (top-right)
  - Windows: look in the **system tray** (bottom-right)
- Or just press the shortcut — the lookup card will appear

---

Something not covered? Open an [issue](https://github.com/537Lab/askthis/issues) — we're happy to help.
