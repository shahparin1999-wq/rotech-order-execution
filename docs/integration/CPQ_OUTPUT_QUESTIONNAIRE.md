# CPQ Output Questionnaire

**Purpose:** capture exactly how the CPQ tool structures a "won" order so the
Work Order System can import it. Please answer against **one real won order**
(fictional/sanitized customer data is fine). Attach the raw export file — do not
reshape it to match anything.

Related: [CPQ_EXPORT_ONBOARDING.md](CPQ_EXPORT_ONBOARDING.md),
[CPQ_EXECUTION_CONTRACT.md](CPQ_EXECUTION_CONTRACT.md).

---

## 0. Attach one raw export
- [ ] Attach a real won order exported in the CPQ's **native** format
      (JSON / XML / CSV / API response). Ideally 2 lines, one with quantity > 1,
      at least one 1196 pump.

## 1. Quote & revision identity
- What is the **quote number** field, and its stable **quote id**?
- What is the **revision id / revision number**, and how do you mark a revision
  as approved / "won"?
- Can the same order be exported twice? If so, does anything change between
  exports of the **same** revision?

## 2. Customer & commercial
- Customer name and **customer id** field names?
- Is there a **customer PO** field? Optional or always present?
- Any **pricing** fields? (We deliberately exclude pricing from the build
  package — list them so we can ignore them, don't remove them.)

## 3. Lines
- What is the **line id** and **line number** for each configured item?
- Where is the **quantity** per line? (Quantity N creates N independent Units.)
- Product identity per line: **family / model / size / description** field names?

## 4. Configuration (per line)
- Material selections: overall **material build** and **casing / impeller /
  shaft** — field names and example values.
- **Seal**, **motor**, **baseplate**, **coupling** — how are these structured?
  (Object? flat fields? free text?) Which are optional?
- How is **customer-supplied** indicated (e.g. customer-supplied motor)?
- **Testing requirements** (hydrotest, witness, performance) — field name and
  possible values.
- Any **selected options** list (code / description / value)?

## 5. BOM
- Is a **configured BOM** available per line? Fields per item (part number,
  description, quantity, material)?
- Are **part numbers** reliable, or is the BOM descriptive only?

## 6. Documents
- Is there a **document manifest** per line (drawings, curves, datasheets,
  manuals)? Field names (type, id, title, revision)?

## 7. Backend / internal data to expose commercially
- List the **admin / internal / engineering notes** that today live only on the
  CPQ backend but should become visible in Order Execution.
- For each: is it a note to **read** (provenance) or an **instruction to act on**
  in the shop?

## 8. Versioning & integrity
- Do you track a **configuration rules version** / pricing release / document
  manifest version? Field names?
- Can you produce a **checksum/hash** of the export, or should the adapter
  compute it?

## 9. Emission mechanism
- For the first milestone, can a user **download/export a file** for one won
  order? What triggers it (button, report, schedule)?
- Is a live API planned later? (Not needed now.)

## 10. Anything else
- Fields present in your export not covered above (with meaning).
- Fields we asked about that the CPQ **does not** have (so we mark them
  Production-owned, not invented).

---

**Return:** the attached raw export + answers above. That single sample lets us
build the adapter and prove an end-to-end import.
