import datetime as dt, io

WEEKS = [
 (1, dt.date(2026,9,14), "Aircraft, four fundamentals, slow flight", 9.1,
  [("Mon","07:00","Intro, preflight walkthrough, four fundamentals"),
   ("Tue","07:00","Climbs, descents, level-off precision"),
   ("Tue","13:00","Same aircraft — repeat, build muscle memory"),
   ("Wed","07:00","Slow flight, configuration changes"),
   ("Thu","07:00","Steep turns, ground reference"),
   ("Thu","13:00","Pattern entry, radio work"),
   ("Fri","07:00","Review + first landings practice"),
   ("Sat","07:00","BUFFER — makeup for the week's weather day")],
  ["Enrolment paperwork signed; Part 141 private course, PIAT",
   "Proof of citizenship on file (passport, or birth certificate + photo ID)",
   "First-class medical copy on file",
   "Student pilot certificate applied for via IACRA",
   "King Schools course started — aim 25% by Sunday",
   "★ PPL written (PAR) sat Thu 17 Sep — bring photo ID, keep the score report",
   "Standing pattern booked through 30 November",
   "Primary and backup Alpha Trainer tail numbers written into the booking",
   "Stage-check approval charge confirmed in writing (question A1)"]),
 (2, dt.date(2026,9,21), "Stalls, emergencies, landings, pre-solo prep", 9.8,
  [("Mon","07:00","Power-off and power-on stalls"),
   ("Tue","07:00","Emergency procedures, engine-out drills"),
   ("Tue","13:00","Pattern work — 8-10 landings"),
   ("Wed","07:00","Crosswind landings"),
   ("Thu","07:00","Go-arounds, short and soft field"),
   ("Thu","13:00","Pattern work — consistency"),
   ("Fri","07:00","Pre-solo manoeuvre review"),
   ("Sat","07:00","BUFFER")],
  ["61.87(b) pre-solo knowledge test taken and corrected with your instructor",
   "Airspace, weather minimums and school solo limits understood cold",
   "Solo wind limits confirmed — school policy, not the POH",
   "King Schools course ~50%",
   "Cadence check: did you fly 6 or more of 8 booked slots? If not, raise it now",
   "Instrument ground portion enrolled — no certificate needed for the ground part"]),
 (3, dt.date(2026,9,28), "FIRST SOLO, then solo consolidation", 10.5,
  [("Mon","07:00","Landing consistency, instructor assessment"),
   ("Tue","07:00","★ FIRST SOLO window — three takeoffs and landings"),
   ("Tue","13:00","Solo pattern consolidation — $195/hr from here"),
   ("Wed","07:00","Dual — new material resumes"),
   ("Thu","07:00","Stage 1 check preparation"),
   ("Thu","13:00","Solo practice area work"),
   ("Fri","07:00","★ STAGE 1 CHECK"),
   ("Sat","07:00","BUFFER")],
  ["61.87(n) solo endorsement in your logbook — make and model specific, 90 days",
   "Student pilot certificate IN HAND before any solo flight",
   "Solo endorsement is from the instructor who trained you in that make and model — 61.87(p)",
   "Stage 1 check passed and logged",
   "Afternoon blocks switched from dual to solo where the syllabus allows",
   "King Schools course ~75%",
   "Cadence check: 6+ of 8 flown?"]),
 (4, dt.date(2026,10,5), "Cross-country and night — the big-block week", 14.0,
  [("Mon","07:00","XC planning, chart work, weight and balance"),
   ("Tue","07:00","★ NIGHT DUAL — evening slot, night begins 18:56"),
   ("Tue","13:00","Ground: night XC planning"),
   ("Wed","07:00","★ DUAL CROSS-COUNTRY — 4-5 hr block"),
   ("Thu","07:00","★ NIGHT XC >100 NM + 10 takeoffs and landings"),
   ("Thu","13:00","Rest — do not stack a third session on a night flight"),
   ("Fri","07:00","Solo XC preparation and route brief"),
   ("Sat","07:00","BUFFER — protect this one, XC weeks slip most")],
  ["61.93 solo cross-country endorsement obtained before any solo XC",
   "Route for the 100 NM solo XC planned, briefed and approved — 3 landing points, one 50 NM leg",
   "Night currency understood: night per 14 CFR 1.1 is end of evening civil twilight",
   "Flight plans filed and closed on every XC — practise the habit now",
   "King Schools course complete",
   "IRA study started — the instrument written is 3 weeks out",
   "Cadence check: 6+ of 8 flown? You are at the half-way point of the course"]),
]

out=[]
cum=0.0
for n,mon,theme,hrs,slots,admin in WEEKS:
    cum+=hrs
    sun=mon+dt.timedelta(days=6)
    out.append(f'<div class="wkcard">')
    out.append(f'<div class="wkhead"><div><span class="wknum">Week {n}</span>'
               f'<h4>{mon:%a %d %b} &ndash; {sun:%a %d %b}</h4><p class="wktheme">{theme}</p></div>'
               f'<div class="wktgt"><span>Target this week</span><b>{hrs:.1f} hr</b>'
               f'<span>Cumulative</span><b>{cum:.1f} hr</b></div></div>')
    out.append('<div class="tw"><table class="wktab"><thead><tr>'
               '<th style="width:64px">Day</th><th style="width:58px">Slot</th><th>Planned</th>'
               '<th style="width:56px" class="num">Hobbs</th><th style="width:44px" class="num">D/S</th>'
               '<th style="width:60px" class="num">Cum hr</th><th style="width:34px">&#10003;</th>'
               '</tr></thead><tbody>')
    for i,(day,slot,plan) in enumerate(slots):
        d = mon+dt.timedelta(days=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].index(day))
        star = ' class="hl"' if plan.startswith("★") else ''
        out.append(f'<tr{star}><td><b>{day}</b><span class="dt2">{d:%d/%m}</span></td><td>{slot}</td>'
                   f'<td>{plan}</td><td class="fill"></td><td class="fill"></td><td class="fill"></td>'
                   f'<td class="fill"></td></tr>')
    out.append('</tbody></table></div>')
    out.append('<div class="wkadmin"><b>Before this week is out</b><ul>')
    for a in admin: out.append(f'<li><span class="box"></span>{a}</li>')
    out.append('</ul></div>')
    out.append('<div class="tally"><b>Week tally</b>'
               '<span>Booked <u>&nbsp;&nbsp;8&nbsp;&nbsp;</u></span>'
               '<span>Flown <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u></span>'
               '<span>Weather <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u></span>'
               '<span>Maintenance <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u></span>'
               '<span>Hobbs total <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u></span></div>')
    out.append('</div>')
io.open('wk_body.html','w').write("\n".join(out))
print("weekly cards built:", len(WEEKS), "weeks, cumulative", cum, "hr")
