// English / Bangla dictionaries, t() and number / date helpers. No React imports.
//
// translate(lang, key, params):
//   - "{name}" placeholders are filled from params
//   - number params are shown with Bangla digits in Bangla mode
//   - a param can be { en, bn } to pick the text for the current language
//   - when params.count is a number, "key_one" / "key_other" are used if they exist

import { isValidYmd } from "./utils/dates.js";

export const LANGS = ["en", "bn"];

const en = {
  "app.name": "TenderPack",
  "app.subtitle": "Tender Document Package Builder",
  "header.local": "Processed locally in your browser",
  "header.localTitle": "Your files never leave this computer. Nothing is uploaded to any server.",
  "lang.label": "Language",

  "empty.heading": "Step 1 — Load requirements.json",
  "empty.explain":
    "TenderPack checks your PDF documents against the tender's list of required documents and builds one complete, correctly ordered package PDF.",
  "empty.drop": "Drag and drop requirements.json here",
  "empty.or": "or",
  "empty.choose": "Choose requirements.json",
  "empty.privacy": "Your files never leave this computer. Nothing is uploaded.",
  "empty.errorTitle": "requirements.json could not be loaded",

  "json.loaded": "Requirements loaded: {count} documents for tender {id}.",
  "json.notJson": "{name} is not a .json file. Please choose requirements.json.",
  "json.errorTitle": "requirements.json could not be loaded",

  "zip.button": "Load pack (.zip)",
  "zip.hint": "Have the whole pack as one .zip (requirements.json + documents folder)?",
  "zip.opening": "Opening pack…",
  "zip.loaded": "Pack loaded: tender {id}, {count} files found in the documents folder.",
  "zip.errorTitle": "The pack could not be loaded",
  "zip.zip_invalid": "This .zip file could not be opened. It may be damaged.",
  "zip.zip_no_requirements": "No requirements.json was found inside the .zip file.",
  "zip.zip_too_large": "The .zip file is too large (maximum {size}).",
  "confirm.replacePack": "Load this pack? The current tender, files, matches and dates will be replaced.",

  "err.json_unreadable": "The file could not be read.",
  "err.json_empty": "The file is empty.",
  "err.json_invalid": "This file is not valid JSON. Please check that you chose the right requirements.json.",
  "err.root_not_object": 'requirements.json must contain an object with "tender" and "requirements".',
  "err.tender_missing": 'The "tender" section is missing.',
  "err.tender_field": 'Tender field "{field}" is missing or empty.',
  "err.deadline_format": '"submission_deadline" must be a date in YYYY-MM-DD format (found "{value}").',
  "err.deadline_invalid": '"submission_deadline" is not a real calendar date (found "{value}").',
  "err.requirements_missing": 'The "requirements" list is missing.',
  "err.requirements_empty": 'The "requirements" list is empty.',
  "err.req_not_object": "Requirement {n} is not a valid entry.",
  "err.req_text": 'Requirement {n} ({id}): "{field}" must be non-empty text.',
  "err.req_number": 'Requirement {n} ({id}): "{field}" must be a number.',
  "err.req_boolean": 'Requirement {n} ({id}): "{field}" must be true or false.',
  "err.req_duplicate_id": 'Requirement ID "{id}" is used more than once.',

  "tender.kicker": "Tender Package",
  "tender.id": "Tender ID",
  "tender.title": "Tender Title",
  "tender.entity": "Procuring Entity",
  "tender.bidder": "Bidder",
  "tender.deadline": "Submission Deadline",
  "tender.daysLeft_one": "{count} day left",
  "tender.daysLeft_other": "{count} days left",
  "tender.dueToday": "Due today",
  "tender.passed": "Deadline passed",
  "tender.loadOther": "Load different requirements.json",
  "tender.startOver": "Start over",
  "confirm.startOver": "Start over? All files, matches and expiry dates will be cleared.",
  "confirm.replaceJson":
    "Load a new requirements.json? Current matches and expiry dates will be cleared. Uploaded PDF files are kept.",

  "steps.aria": "Progress",
  "steps.tender": "Tender",
  "steps.documents": "Documents",
  "steps.review": "Review",
  "steps.generate": "Generate",
  "steps.state.done": "done",
  "steps.state.current": "current step",
  "steps.state.problem": "needs attention",
  "steps.state.upcoming": "not started",

  "ready.heading": "Readiness",
  "ready.count": "{ready} of {total} documents ready",
  "ready.nothing": "No documents selected yet",
  "stat.issues": "Issues to fix",
  "stat.files": "Files uploaded",
  "stat.size": "Total size",
  "stat.pages": "Package pages",
  "stat.ofMax": "{value} / {max}",

  "upload.heading": "Uploaded files",
  "upload.drop": "Drag and drop PDF files here",
  "upload.or": "or",
  "upload.choose": "Choose PDF files",
  "upload.limits": "PDF only · up to {max} files · {size} total",
  "upload.reading": "Reading PDF…",
  "upload.dropActive": "Drop the files to add them",

  "rejected.heading": "Files not added",
  "rejected.dismiss": "Dismiss",
  "rejected.dismissAll": "Dismiss all",
  "reject.not_pdf": "{name} is not a PDF file. Only PDF files are accepted.",
  "reject.too_many_files": "{name} was not added. Maximum {max} PDF files allowed.",
  "reject.too_large": "{name} was not added. Total size cannot exceed {size}.",
  "reject.unreadable": "{name} could not be read. It may be damaged or password-protected.",

  "files.empty": "No PDF files yet. Add the documents for this tender.",
  "files.added_one": "{count} PDF file added.",
  "files.added_other": "{count} PDF files added.",
  "files.removed": "{name} removed.",

  "file.pages_one": "{count} page",
  "file.pages_other": "{count} pages",
  "file.matchedTo": "Matched to: {title}",
  "file.notMatched": "Not matched",
  "file.duplicate": "Duplicate",
  "file.sameAs": "Same content as {name}",
  "file.preview": "Preview",
  "file.remove": "Remove",
  "file.previewAria": "Preview {name}",
  "file.removeAria": "Remove {name}",
  "file.previewFailed": "The preview could not be opened. Please allow pop-ups for this site.",

  "checklist.heading": "Required Documents",
  "checklist.summary": "{total} documents · {required} required",
  "col.order": "#",
  "col.document": "Document",
  "col.type": "Type",
  "col.file": "PDF file",
  "col.expiry": "Expiry Date",
  "col.status": "Status",
  "req.required": "Required",
  "req.optional": "Optional",
  "req.hasExpiry": "Has an expiry date",
  "hint.expired": "Expired on {date}, before the deadline {deadline}. Upload a valid document.",
  "hint.expiryNeeded": "Enter the expiry date printed on the document.",
  "expiry.notNeeded": "Not needed",
  "expiry.label": "Expiry Date",
  "expiry.aria": "Expiry date for {title}",

  "auto.button": "Auto-match files",
  "auto.hint": "Match documents that have no file yet by comparing file names with document names",
  "auto.done_one": "{count} file matched automatically. Please check it.",
  "auto.done_other": "{count} files matched automatically. Please check them.",
  "auto.none": "No more files could be matched from their names. Please choose them by hand.",
  "auto.tag": "Suggested — please check",
  "auto.confirm": "Confirm",
  "auto.confirmAria": "Confirm the suggested file for {title}",
  "auto.confirmAll": "Confirm all suggestions",

  "match.label": "Select PDF file",
  "match.aria": "Select PDF file for {title}",
  "match.none": "— No file —",
  "match.noFiles": "Upload PDF files first",
  "match.optUsedFor": "used for {title} — selecting moves it here",
  "match.optDuplicateUsed": "duplicate of {name}, already used",
  "match.moved": "{name} moved from {from} to {to}.",
  "match.duplicateBlocked":
    "{name} has the same content as {other}, which is already used for {title}. One file cannot be used for two documents.",

  "status.ok": "OK",
  "status.missing": "Missing",
  "status.expired": "Expired",
  "status.expiry_needed": "Expiry date needed",
  "status.not_provided": "Not provided",

  "gen.issues_one": "{count} issue must be fixed before generating",
  "gen.issues_other": "{count} issues must be fixed before generating",
  "gen.issueItem": "{title} — {status}",
  "gen.ready": "Package ready — {docs} documents, {pages} pages",
  "gen.readyNote": "Cover page + documents in the required order, with page numbers on every page.",
  "gen.button": "Generate Package",
  "gen.generating": "Generating package…",
  "gen.noDocs": "Add at least one document to generate a package.",
  "gen.done": "Package downloaded: {name}",
  "gen.downloadAgain": "Download again",
  "gen.open": "Open package",
  "gen.error": "The package could not be generated. Please try again.",
  "gen.errorDoc": "{name} could not be added to the package. It may be damaged. Remove it or choose another file.",
  "gen.stale": "Changes made since the last package. Generate again to include them.",

  "toast.close": "Close",
  "toast.region": "Notifications",
  "error.generic": "Something went wrong. Please try again.",
  "crash.title": "Sorry, something went wrong",
  "crash.body": "Please reload the page. Your files were not sent anywhere.",
  "crash.reload": "Reload page",

  "unit.kb": "KB",
  "unit.mb": "MB",
};

const bn = {
  "app.name": "TenderPack",
  "app.subtitle": "টেন্ডার নথিপত্র প্যাকেজ প্রস্তুতকারী",
  "header.local": "আপনার ব্রাউজারেই প্রক্রিয়া করা হয়",
  "header.localTitle": "আপনার ফাইল এই কম্পিউটারের বাইরে যায় না। কোনো সার্ভারে কিছুই আপলোড করা হয় না।",
  "lang.label": "ভাষা",

  "empty.heading": "ধাপ ১ — requirements.json লোড করুন",
  "empty.explain":
    "TenderPack আপনার PDF নথিগুলো টেন্ডারের প্রয়োজনীয় নথির তালিকার সাথে মিলিয়ে দেখে এবং সঠিক ক্রমে সাজানো একটি সম্পূর্ণ প্যাকেজ PDF তৈরি করে।",
  "empty.drop": "requirements.json ফাইলটি এখানে টেনে এনে ছাড়ুন",
  "empty.or": "অথবা",
  "empty.choose": "requirements.json বেছে নিন",
  "empty.privacy": "আপনার ফাইল এই কম্পিউটারের বাইরে যায় না। কিছুই আপলোড করা হয় না।",
  "empty.errorTitle": "requirements.json লোড করা যায়নি",

  "json.loaded": "টেন্ডার {id}-এর {count}টি নথির তালিকা লোড হয়েছে।",
  "json.notJson": "{name} কোনো .json ফাইল নয়। requirements.json বেছে নিন।",
  "json.errorTitle": "requirements.json লোড করা যায়নি",

  "zip.button": "প্যাক লোড করুন (.zip)",
  "zip.hint": "পুরো প্যাকটি কি একটি .zip ফাইলে আছে (requirements.json + documents ফোল্ডার)?",
  "zip.opening": "প্যাক খোলা হচ্ছে…",
  "zip.loaded": "প্যাক লোড হয়েছে: টেন্ডার {id}, documents ফোল্ডারে {count}টি ফাইল পাওয়া গেছে।",
  "zip.errorTitle": "প্যাকটি লোড করা যায়নি",
  "zip.zip_invalid": "এই .zip ফাইলটি খোলা যায়নি। ফাইলটি নষ্ট হতে পারে।",
  "zip.zip_no_requirements": ".zip ফাইলের ভেতরে কোনো requirements.json পাওয়া যায়নি।",
  "zip.zip_too_large": ".zip ফাইলটি অনেক বড় (সর্বোচ্চ {size})।",
  "confirm.replacePack": "এই প্যাকটি লোড করবেন? বর্তমান টেন্ডার, ফাইল, মিল ও তারিখ বদলে যাবে।",

  "err.json_unreadable": "ফাইলটি পড়া যায়নি।",
  "err.json_empty": "ফাইলটি খালি।",
  "err.json_invalid": "এটি সঠিক JSON ফাইল নয়। সঠিক requirements.json বেছে নিয়েছেন কিনা দেখুন।",
  "err.root_not_object": 'requirements.json-এ "tender" ও "requirements" সহ একটি অবজেক্ট থাকতে হবে।',
  "err.tender_missing": '"tender" অংশটি নেই।',
  "err.tender_field": 'টেন্ডারের "{field}" ঘরটি নেই অথবা খালি।',
  "err.deadline_format": '"submission_deadline" অবশ্যই YYYY-MM-DD ফরম্যাটের তারিখ হতে হবে (পাওয়া গেছে "{value}")।',
  "err.deadline_invalid": '"submission_deadline" কোনো সঠিক ক্যালেন্ডার তারিখ নয় (পাওয়া গেছে "{value}")।',
  "err.requirements_missing": '"requirements" তালিকাটি নেই।',
  "err.requirements_empty": '"requirements" তালিকাটি খালি।',
  "err.req_not_object": "{n} নম্বর নথির তথ্য সঠিক নয়।",
  "err.req_text": '{n} নম্বর নথি ({id}): "{field}" অবশ্যই লেখা থাকতে হবে, খালি রাখা যাবে না।',
  "err.req_number": '{n} নম্বর নথি ({id}): "{field}" অবশ্যই একটি সংখ্যা হতে হবে।',
  "err.req_boolean": '{n} নম্বর নথি ({id}): "{field}" অবশ্যই true অথবা false হতে হবে।',
  "err.req_duplicate_id": 'নথির আইডি "{id}" একাধিকবার ব্যবহার করা হয়েছে।',

  "tender.kicker": "টেন্ডার প্যাকেজ",
  "tender.id": "টেন্ডার আইডি",
  "tender.title": "টেন্ডারের শিরোনাম",
  "tender.entity": "ক্রয়কারী প্রতিষ্ঠান",
  "tender.bidder": "দরদাতা",
  "tender.deadline": "দাখিলের শেষ তারিখ",
  "tender.daysLeft": "আর {count} দিন বাকি",
  "tender.dueToday": "আজই শেষ দিন",
  "tender.passed": "শেষ তারিখ পেরিয়ে গেছে",
  "tender.loadOther": "অন্য requirements.json লোড করুন",
  "tender.startOver": "নতুন করে শুরু করুন",
  "confirm.startOver": "নতুন করে শুরু করবেন? সব ফাইল, মিল এবং মেয়াদের তারিখ মুছে যাবে।",
  "confirm.replaceJson":
    "নতুন requirements.json লোড করবেন? বর্তমান মিল ও মেয়াদের তারিখ মুছে যাবে। আপলোড করা PDF ফাইলগুলো থাকবে।",

  "steps.aria": "অগ্রগতি",
  "steps.tender": "টেন্ডার",
  "steps.documents": "নথিপত্র",
  "steps.review": "যাচাই",
  "steps.generate": "তৈরি",
  "steps.state.done": "সম্পন্ন",
  "steps.state.current": "চলমান ধাপ",
  "steps.state.problem": "মনোযোগ প্রয়োজন",
  "steps.state.upcoming": "শুরু হয়নি",

  "ready.heading": "প্রস্তুতি",
  "ready.count": "{total}টির মধ্যে {ready}টি নথি প্রস্তুত",
  "ready.nothing": "এখনো কোনো নথি বেছে নেওয়া হয়নি",
  "stat.issues": "সমাধান বাকি",
  "stat.files": "আপলোড করা ফাইল",
  "stat.size": "মোট আকার",
  "stat.pages": "প্যাকেজের পৃষ্ঠা",
  "stat.ofMax": "{value} / {max}",

  "upload.heading": "আপলোড করা ফাইল",
  "upload.drop": "PDF ফাইলগুলো এখানে টেনে এনে ছাড়ুন",
  "upload.or": "অথবা",
  "upload.choose": "PDF ফাইল বেছে নিন",
  "upload.limits": "শুধু PDF · সর্বোচ্চ {max}টি ফাইল · মোট {size}",
  "upload.reading": "PDF পড়া হচ্ছে…",
  "upload.dropActive": "ফাইল যোগ করতে এখানে ছেড়ে দিন",

  "rejected.heading": "যে ফাইলগুলো যোগ করা হয়নি",
  "rejected.dismiss": "বন্ধ করুন",
  "rejected.dismissAll": "সব বন্ধ করুন",
  "reject.not_pdf": "{name} কোনো PDF ফাইল নয়। শুধু PDF ফাইল গ্রহণ করা হয়।",
  "reject.too_many_files": "{name} যোগ করা হয়নি। সর্বোচ্চ {max}টি PDF ফাইল দেওয়া যাবে।",
  "reject.too_large": "{name} যোগ করা হয়নি। মোট আকার {size}-এর বেশি হতে পারবে না।",
  "reject.unreadable": "{name} পড়া যায়নি। ফাইলটি নষ্ট অথবা পাসওয়ার্ড দিয়ে সুরক্ষিত হতে পারে।",

  "files.empty": "এখনো কোনো PDF ফাইল নেই। এই টেন্ডারের নথিগুলো যোগ করুন।",
  "files.added": "{count}টি PDF ফাইল যোগ করা হয়েছে।",
  "files.removed": "{name} সরানো হয়েছে।",

  "file.pages": "{count} পৃষ্ঠা",
  "file.matchedTo": "যুক্ত আছে: {title}",
  "file.notMatched": "কোনো নথির সাথে যুক্ত নয়",
  "file.duplicate": "একই ফাইল (ডুপ্লিকেট)",
  "file.sameAs": "{name}-এর সাথে হুবহু একই",
  "file.preview": "দেখুন",
  "file.remove": "সরান",
  "file.previewAria": "{name} দেখুন",
  "file.removeAria": "{name} সরান",
  "file.previewFailed": "ফাইলটি খোলা যায়নি। এই সাইটের জন্য পপ-আপ চালু করুন।",

  "checklist.heading": "প্রয়োজনীয় নথিপত্র",
  "checklist.summary": "{total}টি নথি · {required}টি আবশ্যক",
  "col.order": "ক্রম",
  "col.document": "নথি",
  "col.type": "ধরন",
  "col.file": "PDF ফাইল",
  "col.expiry": "মেয়াদ শেষের তারিখ",
  "col.status": "অবস্থা",
  "req.required": "আবশ্যক",
  "req.optional": "ঐচ্ছিক",
  "req.hasExpiry": "মেয়াদ শেষের তারিখ আছে",
  "hint.expired": "মেয়াদ শেষ হয়েছে {date} তারিখে, যা দাখিলের শেষ তারিখ {deadline}-এর আগে। একটি বৈধ নথি আপলোড করুন।",
  "hint.expiryNeeded": "নথিতে লেখা মেয়াদ শেষের তারিখটি দিন।",
  "expiry.notNeeded": "প্রয়োজন নেই",
  "expiry.label": "মেয়াদ শেষের তারিখ",
  "expiry.aria": "{title}-এর মেয়াদ শেষের তারিখ",

  "auto.button": "ফাইল স্বয়ংক্রিয়ভাবে মেলান",
  "auto.hint": "ফাইলের নাম ও নথির নাম মিলিয়ে যে নথিগুলোর ফাইল এখনো বেছে নেওয়া হয়নি সেগুলো মেলায়",
  "auto.done": "{count}টি ফাইল স্বয়ংক্রিয়ভাবে মেলানো হয়েছে। অনুগ্রহ করে যাচাই করুন।",
  "auto.none": "নামের ভিত্তিতে আর কোনো ফাইল মেলানো যায়নি। অনুগ্রহ করে নিজে বেছে নিন।",
  "auto.tag": "প্রস্তাবিত — অনুগ্রহ করে যাচাই করুন",
  "auto.confirm": "নিশ্চিত করুন",
  "auto.confirmAria": "{title}-এর প্রস্তাবিত ফাইল নিশ্চিত করুন",
  "auto.confirmAll": "সব প্রস্তাব নিশ্চিত করুন",

  "match.label": "PDF ফাইল বেছে নিন",
  "match.aria": "{title}-এর জন্য PDF ফাইল বেছে নিন",
  "match.none": "— কোনো ফাইল নয় —",
  "match.noFiles": "আগে PDF ফাইল আপলোড করুন",
  "match.optUsedFor": "{title}-এ ব্যবহৃত — বেছে নিলে এখানে সরে আসবে",
  "match.optDuplicateUsed": "{name}-এর ডুপ্লিকেট, আগেই ব্যবহৃত",
  "match.moved": "{name} ফাইলটি {from} থেকে {to}-এ সরানো হয়েছে।",
  "match.duplicateBlocked":
    "{name} এবং {other} হুবহু একই ফাইল, আর {other} আগেই {title}-এর জন্য ব্যবহৃত। একটি ফাইল দুটি নথির জন্য ব্যবহার করা যাবে না।",

  "status.ok": "ঠিক আছে",
  "status.missing": "অনুপস্থিত",
  "status.expired": "মেয়াদোত্তীর্ণ",
  "status.expiry_needed": "মেয়াদের তারিখ দিন",
  "status.not_provided": "প্রদান করা হয়নি",

  "gen.issues": "প্যাকেজ তৈরির আগে {count}টি সমস্যার সমাধান করতে হবে",
  "gen.issueItem": "{title} — {status}",
  "gen.ready": "প্যাকেজ প্রস্তুত — {docs}টি নথি, {pages} পৃষ্ঠা",
  "gen.readyNote": "কভার পৃষ্ঠা এবং নির্ধারিত ক্রমে সব নথি, প্রতিটি পৃষ্ঠায় পৃষ্ঠা নম্বরসহ।",
  "gen.button": "প্যাকেজ তৈরি করুন",
  "gen.generating": "প্যাকেজ তৈরি হচ্ছে…",
  "gen.noDocs": "প্যাকেজ তৈরি করতে অন্তত একটি নথি যোগ করুন।",
  "gen.done": "প্যাকেজ ডাউনলোড হয়েছে: {name}",
  "gen.downloadAgain": "আবার ডাউনলোড করুন",
  "gen.open": "প্যাকেজ খুলুন",
  "gen.error": "প্যাকেজ তৈরি করা যায়নি। আবার চেষ্টা করুন।",
  "gen.errorDoc": "{name} প্যাকেজে যোগ করা যায়নি। ফাইলটি নষ্ট হতে পারে। এটি সরিয়ে অন্য ফাইল বেছে নিন।",
  "gen.stale": "শেষ প্যাকেজের পরে পরিবর্তন হয়েছে। সেগুলো যুক্ত করতে আবার তৈরি করুন।",

  "toast.close": "বন্ধ করুন",
  "toast.region": "বার্তা",
  "error.generic": "কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।",
  "crash.title": "দুঃখিত, একটি সমস্যা হয়েছে",
  "crash.body": "পৃষ্ঠাটি আবার লোড করুন। আপনার ফাইল কোথাও পাঠানো হয়নি।",
  "crash.reload": "আবার লোড করুন",

  "unit.kb": "কেবি",
  "unit.mb": "এমবি",
};

export const DICTIONARIES = { en, bn };

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

/** Replace ASCII digits with Bangla digits (০-৯). */
export function toBnDigits(value) {
  return String(value).replace(/[0-9]/g, (digit) => BN_DIGITS[Number(digit)]);
}

/** Show a number in the current language (Bangla digits in Bangla mode). */
export function formatNumber(value, lang, { decimals } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) return String(value ?? "");
  const text =
    decimals === undefined
      ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)
      : new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
  return lang === "bn" ? toBnDigits(text) : text;
}

/** "YYYY-MM-DD" -> "20 Oct 2026" (en) or "২০ অক্টোবর, ২০২৬" (bn). */
export function formatDate(ymd, lang) {
  if (!isValidYmd(ymd)) return lang === "bn" ? toBnDigits(ymd ?? "") : ymd ?? "";
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(2000, month - 1, day));
  date.setUTCFullYear(year);
  try {
    const locale = lang === "bn" ? "bn-BD" : "en-GB";
    const options = { day: "numeric", month: lang === "bn" ? "long" : "short", year: "numeric", timeZone: "UTC" };
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    return lang === "bn" ? toBnDigits(ymd) : ymd;
  }
}

/** File size as "2.9 KB" / "1.2 MB" in the current language. */
export function formatBytes(bytes, lang) {
  const dict = DICTIONARIES[lang] ?? en;
  const size = Number(bytes) || 0;
  if (size < 1024 * 1024) {
    const kb = size / 1024;
    return `${formatNumber(kb < 10 ? Math.max(0.1, Math.round(kb * 10) / 10) : Math.round(kb), lang)} ${dict["unit.kb"]}`;
  }
  const mb = size / (1024 * 1024);
  return `${formatNumber(Math.round(mb * 10) / 10, lang)} ${dict["unit.mb"]}`;
}

function formatParam(value, lang) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return formatNumber(value, lang);
  if (typeof value === "object") return String(value[lang] ?? value.en ?? "");
  return String(value);
}

/** Translate `key` for `lang`, filling "{param}" placeholders. Falls back to English, then the key. */
export function translate(lang, key, params) {
  const dict = DICTIONARIES[lang] ?? en;
  const hasCount = params && typeof params.count === "number";
  const form = hasCount && params.count === 1 ? `${key}_one` : `${key}_other`;
  const template = hasCount
    ? dict[form] ?? dict[key] ?? en[form] ?? en[key] ?? key
    : dict[key] ?? en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? formatParam(params[name], lang) : match));
}

/** Everything components need for the current language. */
export function createI18n(lang) {
  const current = LANGS.includes(lang) ? lang : "en";
  return {
    lang: current,
    t: (key, params) => translate(current, key, params),
    num: (value, options) => formatNumber(value, current, options),
    date: (ymd) => formatDate(ymd, current),
    bytes: (size) => formatBytes(size, current),
    /** Requirement title in the current language. */
    title: (req) => (req ? (current === "bn" ? req.title_bn || req.title_en : req.title_en) : ""),
    /** { en, bn } pair for a requirement title, re-translated when the language changes. */
    titlePair: (req) => ({ en: req?.title_en ?? "", bn: req?.title_bn || req?.title_en || "" }),
  };
}

const LANG_STORAGE_KEY = "tenderpack.lang";

export function loadSavedLang() {
  try {
    return globalThis.localStorage?.getItem(LANG_STORAGE_KEY) === "bn" ? "bn" : "en";
  } catch {
    return "en";
  }
}

export function saveLang(lang) {
  try {
    globalThis.localStorage?.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // storage unavailable (private mode / blocked) - the switch still works for this session
  }
}
