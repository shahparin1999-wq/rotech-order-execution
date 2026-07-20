# Team Walkthrough — Rotech Order Execution Prototype

This is a guided script for your first look at the prototype. It replaces
free-form clicking with a short, structured pass so your feedback maps onto
what the real project will eventually need — but it is scoped strictly to
**what this prototype actually does today**, not the full future workflow.

Read [README.md](README.md) first for how to run it locally, or use whatever
link you were given.

## What this is — and is not

This is a **mock-data prototype**, not a working system. Every screen is
labelled "PROTOTYPE - mock data only," and no value in it (order number,
customer, serial numbers, employee names) corresponds to a real Rotech order.
It has no server: everything lives in your browser and only your browser.

**Not implemented — please don't judge these as bugs if you don't see them:**

- **Nonconformance, rework, or reinspection.** There's no flow for failing a
  Unit and routing it through rework. A checklist item can be marked "Fail,"
  but nothing happens after that beyond recording it.
- **Authorization or permissions.** The "Acting as" switcher in the left
  panel lets you become any employee instantly, with no restriction on what
  they can do. A real system enforces role- and facility-based permissions
  server-side; this prototype enforces none of it.
- **Shared or multi-user state.** If two of you open the tool at the same
  time, you are looking at two completely independent sessions. Nothing one
  person clicks is visible to anyone else, ever — there is no server to share
  it through.
- **Controlled quality release.** Every document preview is explicitly marked
  "draft and uncontrolled — not a quality record." Even a Unit that looks
  fully checked off only ever shows "Simulated release," never a real one.
  The underlying 1196 tolerances are placeholders pending Production/Quality
  approval, not engineering-approved values.

## Before you start

Refreshing your browser will **not** lose your progress — it's saved locally
on your device. If you want to start over, use the **"Reset to sample
data"** button near the top of the left panel. That reset only affects your
own browser; it doesn't touch anyone else's session.

## The walkthrough

Work through these in order. Each step is a couple of clicks — note anything
confusing, slow, or wrong as you go (see "What to note" at the end).

### 1. Get oriented

Open the app. You should see a Teams-style layout: navigation on the left,
"Home" in the middle. Click **Orders**, then open the one order in the list.

- Does the header tell you what you need at a glance (customer, due date,
  progress)?
- Click the **Units** tab. You should see five independent Units in five
  different states.

### 2. Follow one Unit

From the Units tab, open **Unit `_1.3`** (it should show as Blocked).

- The bar across the top is the Unit's identity — it should stay visible as
  you work.
- Look at **Route operations** and **Actionable tasks**. Why is it blocked?
- Find the **Resolve Blocker** action and use it. Watch the Unit's status
  badge at the top — it should change once you resolve the blocker.

### 3. Start, pause, and hand off work

Open **Unit `_1.2`** (should show as In assembly, with a paused task).

- You should see a handoff card explaining what the previous "employee" did,
  what's left, and where things physically are.
- Use the **"Acting as"** switcher (top of the left panel) to become a
  different employee, then resume the task.
- Try pausing it again with a different reason. Confirm the *original*
  handoff is still visible somewhere (look for "Earlier handoffs") — nothing
  should be overwritten.

### 4. Fill out a checklist

From the same Unit, open the **Checklist** tab.

- Try entering a measurement outside the shown range — does the app tell you
  clearly?
- Notice the items marked "Pilot placeholder - owner approval required."
  Those numbers are not real engineering tolerances.

### 5. Try the shop-floor tablet view

Open **Unit `_1.2`** again and click **"Open shop-floor tablet view."** If
you have a tablet or can resize your browser window narrower, try it there.

- Are the buttons big enough to use with a glove on, in your judgment?
- Is it always clear which Unit you're working on?

### 6. Simulate a QR scan

Go to **Scan** in the left navigation. Pick the Unit QR for `_1.2` (or any
Unit) and simulate a scan.

- Does it take you to the right place with the right next action offered?

### 7. Look at a document preview

From any Unit, open **"Unit QC history preview."**

- Check the banner at the top — it should be unmistakably marked as a draft,
  not a real quality record.
- Compare two different Units' previews — confirm you never see one Unit's
  serial number, material, or measurements on another Unit's document.

## What to note

For each step, jot down:

- **Role you were imagining** (coordinator, technician, quality, manager)
- **Anything confusing** — where did you hesitate or click the wrong thing?
- **Anything that felt slow or fiddly**, especially on the tablet view
- **Anything that looked wrong** — a Unit showing another Unit's data, a
  status that didn't update, text that didn't make sense
- **What you wished existed** — even if it's one of the "not implemented"
  items above, it's useful to hear which ones you actually missed

There's no formal form for this yet — a shared note or a quick message back
is enough for now. This feedback is meant to feed into the same evidence the
real project's planning process (Workshop 3 in the planning documents) will
eventually need, so specific and concrete beats polished.

## Deployment (not part of this prototype)

This prototype currently runs only locally or via whatever link you were
given directly. See [DEPLOYMENT.md](DEPLOYMENT.md) for what a
company-approved hosting setup would require — nothing has been deployed
anywhere as part of this walkthrough guide.
