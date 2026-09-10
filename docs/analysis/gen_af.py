#!/usr/bin/env python3
"""Air Fleet Part 141 enrollment checklist — question set + markdown."""
import pathlib

SECTIONS = [
 ("A", "The two numbers still open — do not enrol without these", [
  ("a1", "What does the end-of-course stage check cost, beyond the $390 of aircraft rental?",
   "You told me Part 141 here carries no FAA written and no outside DPE — just the plane and a stage-check approval. That removes about $1,175, which is the largest single saving in the whole comparison. But the stage-check charge itself has no number yet, and it is the one line that replaces the DPE fee.",
   "A dollar figure on a written quote. At $85/hr for two or three hours it should be $170–$255. Anything near $1,000 erases the advantage.", "must"),
  ("a2", "Confirm in writing that the Part 141 private course carries no FAA knowledge test and no outside examiner — naming the course.",
   "Examining authority is granted per course under 141.63, and your own price sheet budgets both a $175 written fee and a variable DPE fee. Those lines presumably belong to the Part 61 course, but the sheet does not say so. This is worth $1,175 and it needs to be unambiguous before money moves.",
   "One sentence on the enrolment paperwork naming the private pilot course and confirming examining authority applies to it.", "must"),
  ("a3", "Is the $25.50 briefing/debriefing charge a flat fee per lesson, or is it time billed in 15-minute increments?",
   "This decides whether preparation saves money. If it is flat, arriving with the flight already planned changes nothing. If it is time-based, being prepared cuts it. Over 40 lessons the difference is roughly $500–$900.",
   "Which one it is, in writing. If time-based, the increment and the rate.", "must"),
  ("a4", "Is the 10 hours of 'Classroom Instruction' the accumulated 15-minute pre- and post-flight briefings, or separate sessions on top of them?",
   "40 lessons at 15 minutes each is exactly 10.0 hours — the number on your sheet. If that is what it is, then $750 and the $1,020 briefing charge may be billing the same contact time twice, or they may be two genuinely different things. Combined they are $1,770, about $44 a lesson.",
   "A plain description of what the 10 hours actually is, and confirmation it is not double-counted with the briefing charge.", "high"),
 ]),

 ("B", "Course structure — how few hours can this legitimately be", [
  ("b1", "Is your private pilot course approved at the Appendix B minimums, or do you hold a §141.55(e) deviation?",
   "Appendix B sets 35 flight hours and 35 ground hours. 141.55(d)–(e) lets the FAA approve a course below those minimums once a school has held its certificate 24 months and trained 10 students with at least 80% first-time pass. If you hold a deviation, the approved course could be below 35 flight hours — cheaper than anything in my budget.",
   "Which one, and the approved ground and flight hours in the course outline.", "must"),
  ("b2", "You quote 30 hours of ground. Appendix B §3(a)(1) says 35. How are the 30 logged under Part 141?",
   "Not a gotcha — the King Schools course plus your 10 classroom hours is 40 and clears it either way. But I want to understand what is being logged against the course outline, because it is the same question as b1.",
   "How the ground hours are recorded, and whether the King course counts toward them.", "high"),
  ("b3", "What is the dual/solo split in the approved course — and can the solo share be larger?",
   "Solo is $195/hr and dual is $280. Appendix B's floor is 20 dual and 5 solo out of 35. Every hour moved from dual to solo saves $85, and 10 hours moved is $850.",
   "The approved split, and whether the syllabus allows more solo once I am consistent.", "high"),
  ("b4", "How many stage checks are there, who gives them, and what does each cost?",
   "Stage checks are a Part 141 scheduling dependency that does not exist under Part 61 — they need a check instructor, not just my instructor. If they are hard to schedule they become the new bottleneck now that the DPE queue is gone.",
   "The number, the cost, and how far ahead they must be booked.", "must"),
  ("b5", "Your template assumes 60 dual hours. If I meet the standards earlier, can the course close out below that?",
   "Your own disclaimer says the hours are an estimate of the average student, not a guarantee. I want it confirmed that the invoice follows hours actually flown, not the template.",
   "Confirmation that billing is by hours flown and the course completes when the standards are met.", "high"),
 ]),

 ("C", "The Pipistrel — the one aircraft question that can break the plan", [
  ("c1", "Which tail number will I fly, and may I see that aircraft's FAA operating limitations?",
   "The Alpha Trainer is a light-sport aircraft. Its type-design POH approves day VFR, night VFR and IFR in VMC, but the authority for any individual airframe is its own FAA operating limitations document, which is tail-number specific.",
   "The N-number, and sight of the operating limitations.", "must"),
  ("c2", "Is that airframe legal and equipped for night VFR under 91.205(c)?",
   "Appendix B requires 3 hours of night including a cross-country over 100 NM and 10 takeoffs and landings. The Alpha Trainer POH leaves navigation, anti-collision and landing lights off its minimum equipment list even in the night column, deferring to local rules. In the US that means 91.205(c).",
   "A yes with the equipment list, or a plan for where the night hours get flown.", "must"),
  ("c3", "If night has to be flown in a 172S, what is the checkout and what does it cost?",
   "Three hours at the 172S dual rate instead of the Pipistrel is about $195 more, which is trivial. A separate checkout requirement is not trivial — it is more hours.",
   "The cost delta and whether a checkout is required first.", "high"),
  ("c4", "What is the actual useful load, and does it work with my instructor's weight?",
   "POH figures are max takeoff 1,212 lb, empty 615 lb, useful load 597 lb, usable fuel about 76 lb — leaving roughly 520 lb for two people and bags, against about 880 lb in a 172S. Your aircraft is the Alpha Trainer PRO, which may differ.",
   "The real weight and balance for that tail number, checked against a specific instructor.", "high"),
  ("c5", "How many Alpha Trainers are in service, and what happens when mine is down?",
   "One airframe means every inspection stops my training. This matters more here than at a school with nine 172s.",
   "The number in service and a named backup, ideally the same type.", "high"),
 ]),

 ("D", "Cadence — the reason I am choosing you", [
  ("d1", "Can I lock a standing recurring reservation — six days a week, with two blocks on two of those days?",
   "This is what I am buying. Six booked days yields about five flown after weather; two of those as doubles gets me to seven sessions a week. That is the difference between finishing in late October and finishing in January, and at $280/hr the hours saved dwarf every price difference between schools.",
   "A named recurring pattern in writing, reserved for the duration of the course.", "must"),
  ("d2", "Can you genuinely sustain 8–9 booked slots a week for one student — aircraft and instructor both?",
   "Six days with doubles on two or three is 8–9 slots held, of which roughly 7 get flown. You told me you could take on more days and two a day; I want that as a capacity answer, not an intention.",
   "An honest yes or no, stated in sessions per week rather than days.", "must"),
  ("d3", "Can I have the first slot of the day, around 07:00, six days a week?",
   "Calm air, fewest cancellations, and no delay inherited from an earlier flight. The early slot is what converts six booked days into five flown ones.",
   "The 07:00 slot as a standing booking.", "high"),
  ("d4", "Who is my instructor, how many other students do they carry, and who is my backup?",
   "Instructor availability is the constraint that actually decides whether the standing schedule survives contact with reality. Turnover mid-course is the most common cause of extra hours.",
   "A name, an honest load, a named backup, and whether they plan to be here through my check.", "high"),
  ("d5", "If the aircraft goes unserviceable on a booked morning, do I get priority on another airframe?",
   "Determines whether a maintenance surprise costs me a lesson or just an airplane.",
   "Priority re-assignment for students on a standing schedule.", "high"),
  ("d6", "What is the cancellation policy, and how late can I cancel for weather?",
   "I am deliberately booking a sixth day as a weather buffer, so I will cancel roughly one slot a week by design. A tight window plus a fee turns that buffer into a recurring charge.",
   "A weather carve-out with a same-morning window.", "high"),
 ]),

 ("E", "Money and admin", [
  ("e1", "Do you offer block-time or prepayment discounts, and what is the refund policy if I relocate mid-course?",
   "I expect to move to Texas after the instrument phase begins, so any prepayment needs a clean exit. Part 141 enrolment makes this more pointed than it would be under Part 61.",
   "The discount terms and the refund mechanics in writing.", "high"),
  ("e2", "Do you have a ForeFlight education or volume licence that covers students?",
   "ForeFlight runs volume pricing for organisations that distribute licences to students and instructors. Individual tiers are Starter $130, Essential $260, Premium $390 a year. Worth up to $390 a year, and it standardises my plates with my instructor's.",
   "Added to the school licence, or told which tier the instructors teach with.", "high"),
  ("e3", "Is the Redbird FMX $90/hr flat, or does the $20 fuel surcharge apply?",
   "Your surcharge line reads 'all aircraft except PIAT'. A simulator is not an aircraft and burns no fuel, but the sheet does not say so.",
   "Confirmation it is $90 flat, plus $85 if an instructor is present.", "std"),
  ("e4", "After the certificate, what is the renter rate and checkout for the Alpha Trainer?",
   "At $195/hr wet it is the cheapest time-builder on the field, and I will need cross-country PIC hours. But it is a light-sport aircraft, so I want the rental terms confirmed rather than assumed.",
   "The renter rate, the checkout requirement, and confirmation that solo rental is available to certificated pilots.", "high"),
  ("e5", "Can any of the 30-hour King Schools ground school be waived — I have already worked through Sporty's?",
   "Under Part 61, 61.105(a) accepts a home-study course. Under Part 141 the ground training has to be in the approved course outline, so the King course may be mandatory regardless. It is only $427.57, but worth asking.",
   "Whether the King course is required, or whether prior self-study can substitute.", "std"),
 ]),

 ("F", "The instrument phase — where the real money is", [
  ("f1", "Does your examining authority extend to the Part 141 instrument course as well?",
   "If it does, the instrument rating also avoids an outside DPE — worth another $1,000 or so, and it removes the examiner queue from that phase too.",
   "Yes or no, per course.", "high"),
  ("f2", "Confirm your Part 141 instrument course carries no 50-hour cross-country PIC prerequisite.",
   "This is the largest number in my whole plan. Appendix C's only enrolment prerequisite is holding a private certificate — the 50 hours of cross-country PIC in 61.65(d)(1) is a Part 61 requirement. Flown under 141 that requirement disappears, which is roughly $4,700 of pure rental I do not have to buy.",
   "Written confirmation, and the course's actual enrolment prerequisites.", "must"),
  ("f3", "I will likely finish the instrument rating in Denton, Texas. How is your course staged, and what transfers?",
   "141.77 caps transfer credit at 50% of a course from another Part 141 school and 25% from Part 61 training. I need to know what a partial instrument phase here is worth when I move, before I start it.",
   "The stage structure, and an honest view of what a receiving school could credit.", "high"),
  ("f4", "Which aircraft would I fly for the instrument rating, and what is the IFR-capable fleet?",
   "The Alpha Trainer is VMC-only, so the instrument phase moves to a 172. The 172S steam is $260 wet and the G1000NXi is $300 — a $40/hr difference over 20 aircraft hours is $800.",
   "The aircraft, the rate, and whether the G1000NXi is worth it for instrument work specifically.", "high"),
 ]),
]

BRING = [
 "The Air Fleet course estimate sheet, pages 1 and 9, so rates can be checked line by line",
 "Your logbook, first-class medical, and the FAA written result if you have sat it",
 "Your King Schools / Sporty's course progress, to argue the ground-school question",
 "A calendar with the six-day pattern you want, ready to fill in",
 "This checklist, and the budget table below",
]

LEAVE = [
 "The stage-check approval charge, as a number",
 "Examining authority confirmed in writing, naming the private course",
 "Whether the briefing charge is flat or time-based",
 "The approved course hours — Appendix B minimums or a §141.55(e) deviation",
 "The Pipistrel's tail number and its night-VFR status",
 "A standing six-day reservation pattern, in writing",
 "Your instructor's name and their real student load",
 "Block-time terms and the refund policy if you relocate",
 "Whether examining authority covers the instrument course too",
 "Written confirmation there is no 50-hour cross-country PIC prerequisite",
]

LEVERAGE = [
 ("Written test done or imminent", "No ground-school revenue is being given up, and it signals you will not stall."),
 ("First-class medical already held", "No delay before solo, and it signals a career track — instrument and beyond."),
 ("Own equipment, self-studied", "Nothing to sell you, so concessions cost them little."),
 ("Six booked days a week, with doubles", "8–9 slots a week on one aircraft and one instructor is dense, predictable utilisation — the most attractive scheduling profile a school can book."),
 ("You looked at both schools and chose on cadence", "You are not price-shopping them. You are buying schedule, and you can say so plainly — which makes the standing reservation the thing to hold them to."),
]

# ------------------------------------------------------------------ markdown --
md = ["# Air Fleet — Part 141 Enrolment Checklist\n"]
md.append("""**School:** Air Fleet Training Systems, Essex County Airport (KCDW), Fairfield NJ.
**Plan:** Part 141 private pilot certificate in the Pipistrel ALPHA Trainer PRO, six days a week
booked and about five flown, with double blocks on two of them. Ground school is the self-paced
King Schools course at home; the in-person ground is pre- and post-flight briefing and stage
checks. Instrument phase to follow here, finishing at Denton, Texas.

**Already resolved at the school:** Part 141 here carries **no FAA knowledge test and no outside
DPE** — examining authority applies, and the end-of-course check is an internal stage check. That
removes about $1,175 and, more importantly, removes the examiner queue from the schedule.

Priority key: **MUST** = do not enrol without it · **HIGH** = materially affects budget or
schedule · standard = worth asking if there is time.
""")
for code, title, items in SECTIONS:
    md.append(f"\n## {code}. {title}\n")
    md.append("| # | Question | Why it matters | What to push for | Priority |")
    md.append("| --- | --- | --- | --- | --- |")
    for n, (qid, q, why, push, pri) in enumerate(items, 1):
        md.append(f"| {code}{n} | {q} | {why} | {push} | {pri.upper()} |")
md.append("\n## What to bring\n")
for b in BRING: md.append(f"- {b}")
md.append("\n## Leave with these ten answers\n")
for i, l in enumerate(LEAVE, 1): md.append(f"{i}. {l}")
md.append("\n## Your negotiating position\n")
md.append("| What you bring | Why it is leverage |")
md.append("| --- | --- |")
for a, b in LEVERAGE: md.append(f"| **{a}** | {b} |")
md.append("""
---

*Rates are from the Air Fleet course estimate sheet dated 20 October 2025 and verified against
that sheet's own course totals. Regulatory references are to 14 CFR Parts 61 and 141. Every item
on this list is a question precisely because it is not yet confirmed in writing.*
""")
p = pathlib.Path("/home/user/aviation-clarity/docs/analysis/air-fleet-enrollment-checklist.md")
p.write_text("\n".join(md) + "\n")
print("markdown written:", p, sum(len(i) for _,_,i in SECTIONS), "questions")
