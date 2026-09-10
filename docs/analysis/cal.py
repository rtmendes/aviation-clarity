import datetime as dt, html
# activity codes -> (css class, label)
LEG = {
 "D":("d","Dual, 07:00"), "DD":("dd","Double: dual 07:00 + second block"),
 "S":("s","Solo"), "N":("n","Night session (evening)"),
 "X":("x","Cross-country block"), "SC":("sc","Stage check"),
 "T":("t","Written test"), "I":("i","Instrument dual"),
 "A":("a","AATD / Redbird"), "TB":("tb","Time-building, Pipistrel PIC"),
 "R":("r","Rest / buffer"), "M":("m","Milestone"),
}
# explicit day plan: date -> (code, note)
P = {}
def setday(d, code, note=""): P[d]=(code,note)

def wk_pattern(d):
    w=d.weekday()
    if w==6: return "R",""            # Sunday off
    if w in (1,3): return "DD",""     # Tue, Thu doubles
    return "D",""

# --- Sept 14 - Oct 18: PPL flying block
d=dt.date(2026,9,14)
while d<=dt.date(2026,10,18):
    c,n=wk_pattern(d); setday(d,c,n); d+=dt.timedelta(days=1)

setday(dt.date(2026,9,10),"M","TODAY — enrol, book the standing pattern to 30 Nov")
setday(dt.date(2026,9,11),"M","Paperwork, King Schools course started, dispatch set up")
setday(dt.date(2026,9,12),"R","Weekend — ground study")
setday(dt.date(2026,9,13),"R","Weekend — ground study")
setday(dt.date(2026,9,14),"D","FIRST LESSON")
setday(dt.date(2026,9,17),"T","PPL written (PAR) — $175, valid 24 months")
setday(dt.date(2026,9,29),"S","FIRST SOLO window opens (~11 dual sessions in)")
setday(dt.date(2026,10,2),"SC","Stage 1 check")
setday(dt.date(2026,10,6),"N","Night dual — night begins 18:56")
setday(dt.date(2026,10,8),"N","Night XC >100 NM + 10 takeoffs/landings")
setday(dt.date(2026,10,7),"X","Dual XC")
setday(dt.date(2026,10,13),"X","SOLO 100 NM XC — 3 landing points, 50 NM leg")
setday(dt.date(2026,10,14),"SC","Stage 2 check")
setday(dt.date(2026,10,16),"D","3 hr practical-test prep begins")
setday(dt.date(2026,10,19),"D","Test prep")
setday(dt.date(2026,10,20),"D","Test prep")
setday(dt.date(2026,10,21),"SC","Stage 3 / mock check")
setday(dt.date(2026,10,22),"R","Rest before the check")
setday(dt.date(2026,10,23),"M","★ END-OF-COURSE CHECK — private certificate")

# --- Oct 26 onward: transition + instrument
setday(dt.date(2026,10,26),"D","172S transition checkout begins (4 hr)")
setday(dt.date(2026,10,27),"D","172S transition")
setday(dt.date(2026,10,28),"T","IRA written (instrument) — take it now, while it is fresh")
setday(dt.date(2026,10,29),"D","172S transition complete")
setday(dt.date(2026,10,30),"A","AATD — instrument scan basics")
setday(dt.date(2026,10,31),"R","")
setday(dt.date(2026,11,1),"M","DST ends — night now begins 17:23")

d=dt.date(2026,11,2)
while d<=dt.date(2026,12,10):
    w=d.weekday()
    if w==6: setday(d,"R","")
    elif w in (0,2,4): setday(d,"I","")
    elif w in (1,3): setday(d,"A","")
    else: setday(d,"TB","")
    d+=dt.timedelta(days=1)

setday(dt.date(2026,11,2),"I","Instrument flight training begins")
setday(dt.date(2026,11,13),"M","MID-POINT REVIEW — ~17 hr logged; check F9 before going further")
setday(dt.date(2026,11,26),"R","Thanksgiving")
setday(dt.date(2026,11,27),"R","")
setday(dt.date(2026,12,10),"M","★ TARGET STATE — see below")

MON=["January","February","March","April","May","June","July","August","September","October","November","December"]
def month(y,m,upto=None):
    first=dt.date(y,m,1); start=first-dt.timedelta(days=first.weekday())
    last=dt.date(y,m+1,1)-dt.timedelta(days=1) if m<12 else dt.date(y,12,31)
    if upto: last=upto
    out=[f'<h3>{MON[m-1]} {y}</h3>','<div class="tw"><table class="cal">',
         '<thead><tr>'+''.join(f'<th>{x}</th>' for x in ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"])+'</tr></thead><tbody>']
    d=start
    while d<=last+dt.timedelta(days=6-last.weekday()):
        out.append('<tr>')
        for _ in range(7):
            if d.month!=m or (upto and d>upto):
                out.append('<td class="off"></td>')
            else:
                code,note=P.get(d,("",""))
                cls,lab=LEG.get(code,("",""))
                out.append(f'<td class="{cls}"><span class="dn">{d.day}</span>'
                           + (f'<span class="cd">{code}</span>' if code else '')
                           + (f'<span class="nt">{html.escape(note)}</span>' if note else '')+'</td>')
            d+=dt.timedelta(days=1)
        out.append('</tr>')
        if d>last: break
    out.append('</tbody></table></div>')
    return "\n".join(out)

cal = month(2026,9)+month(2026,10)+month(2026,11)+month(2026,12,upto=dt.date(2026,12,10))
open('cal_body.html','w').write(cal)
print("calendar built,", len(cal), "bytes")
