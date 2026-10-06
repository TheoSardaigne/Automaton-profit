"""Render the existing 6 October 2026 scheduling snapshot, without new research."""
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/pdf/competitor-research-sample.pdf'
OUT.parent.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont('Segoe', 'C:/Windows/Fonts/segoeui.ttf'))
pdfmetrics.registerFont(TTFont('SegoeBold', 'C:/Windows/Fonts/segoeuib.ttf'))
pdfmetrics.registerFontFamily('Segoe', normal='Segoe', bold='SegoeBold')
NAVY, TEAL, INK, MUTED, LINE, PALE = map(HexColor, ['#142B3B','#087E82','#203747','#526775','#D9E3E7','#EFF5F5'])
W,H=A4
M=46
CW=W-2*M
DISCLAIMER='Independent portfolio sample — not commissioned client work. No affiliation with the companies mentioned.'
C=canvas.Canvas(str(OUT),pagesize=A4,pageCompression=1)
C.setTitle('Competitor Research Sample — Scheduling Software')
C.setAuthor('Independent portfolio sample')
C.setSubject('Public-source scheduling software comparison; snapshot consulted 6 October 2026')

def para(text,x,y,width=CW,size=10.2,color=INK,bold=False,leading=None):
    p=Paragraph(text,ParagraphStyle('p',fontName='SegoeBold' if bold else 'Segoe',fontSize=size,leading=leading or size*1.43,textColor=color))
    _,height=p.wrap(width,1000)
    p.drawOn(C,x,y-height)
    return y-height

def label(text,y):
    C.setFillColor(TEAL);C.setFont('SegoeBold',8.7);C.drawString(M,y,text.upper())

def frame(page,section):
    C.setFillColor(NAVY);C.rect(0,H-9,W,9,fill=1,stroke=0)
    C.setFont('SegoeBold',8.4);C.setFillColor(MUTED)
    C.drawString(M,H-36,'COMPETITOR RESEARCH  /  PORTFOLIO SAMPLE')
    C.setFont('Segoe',8);C.drawRightString(W-M,H-36,section)
    C.setStrokeColor(LINE);C.line(M,75,W-M,75)
    para(escape(DISCLAIMER),M,61,CW-35,size=7.3,color=MUTED,leading=10.3)
    C.setFont('SegoeBold',9);C.setFillColor(TEAL);C.drawRightString(W-M,47,f'{page} / 3')

def table(rows,widths,y):
    converted=[]
    for i,row in enumerate(rows):
        converted.append([Paragraph(v,ParagraphStyle('cell',fontName='SegoeBold' if i==0 else 'Segoe',fontSize=9.1,leading=13.1,textColor=white if i==0 else INK)) for v in row])
    t=Table(converted,colWidths=widths,hAlign='LEFT')
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),NAVY),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),12),('RIGHTPADDING',(0,0),(-1,-1),12),('TOPPADDING',(0,0),(-1,-1),12),('BOTTOMPADDING',(0,0),(-1,-1),12),('ROWBACKGROUNDS',(0,1),(-1,-1),[PALE,white]),('LINEBELOW',(0,1),(-1,-1),0.5,LINE)]))
    _,height=t.wrap(CW,1000);t.drawOn(C,M,y-height)
    return y-height

# Page 1: pricing context and a decision-oriented overview.
frame(1,'01  /  Overview')
label('Public-source snapshot  |  6 October 2026',H-77)
y=para('Competitor Research Sample —<br/>Scheduling Software',M,H-100,size=27,bold=True,leading=34,color=NAVY)
y=para('Calendly  ·  SavvyCal  ·  Cal.com',M,y-17,size=13,color=TEAL,bold=True)
y=para('A focused comparison of published offers for individuals and small teams. Prices below describe the selected plans and their stated billing context; they are not a like-for-like price ranking.',M,y-22,size=10.5)
label('Pricing at a glance',y-30)
y=table([
    ['Selected offer','Displayed price','Billing context and unknowns'],
    ['<b>Calendly</b><br/>Standard [1]','<b>$10</b> / seat / month','Page showing yearly billing.<br/>Monthly payment amount, currency code and tax treatment: <b>UNKNOWN</b>.'],
    ['<b>SavvyCal</b><br/>Basic [2]','<b>$10</b> / user / month','Page displays “Save 2 months”. Active annual/monthly selector, currency code, upfront amount and taxes: <b>UNKNOWN</b>.'],
    ['<b>Cal.com</b><br/>Teams [3]','<b>$12</b> / user / month','Explicitly labeled YEARLY.<br/>Monthly payment amount, currency code and taxes: <b>UNKNOWN</b>.'],
],[104,126,CW-230],y-43)
label('Key takeaways',y-31)
y=para('<b>Start with the use case.</b> Solo users should check free-plan calendar and event-type limits; teams should prioritize coordination features.',M,y-44)
y=para('<b>Compare matching features.</b> Round-robin routing, custom domains and delegation are different needs. The selected paid tiers do not establish equivalent functionality.',M,y-12)
y=para('<b>Validate the checkout context.</b> Confirm currency, billing selection, upfront payment and taxes before calculating annual cost or making a purchase.',M,y-12)
assert y>92,('Page 1 overflow',y)
C.showPage()

# Page 2: features and clearly separated interpretation.
frame(2,'02  /  Offer profiles')
label('Published features and positioning',H-78)
y=para('What each offer emphasizes',M,H-99,size=24,bold=True,color=NAVY)
y=para('Features are statements from the official pricing pages. Positioning notes are interpretations of the published tiers, not tested performance or evidence of market share.',M,y-17,size=10.3)

profiles=[
    ('01','Calendly','Standard [1]',
     'Multiple calendar connections, unlimited event types, automated reminders, and Stripe/PayPal connections.',
     'Free tier: one event type and one calendar.',
     'A broad progression from individual scheduling to team routing.'),
    ('02','SavvyCal','Basic [2]',
     'Unlimited calendars and booking links; team scheduling.',
     'Premium is displayed at $17/user/month and adds custom domains, delegation and paid bookings. Its billing context, currency code and taxes are UNKNOWN in this sample.',
     'Basic addresses individuals and small teams; Premium emphasizes greater control of scheduling flows.'),
    ('03','Cal.com','Teams [3]',
     'Shared availability, round-robin scheduling, routing forms and removal of branding.',
     'Free individual tier lists unlimited event types and calendars. Teams offers a 14-day trial.',
     'The paid tier centers on collaborative scheduling, above a broad individual free tier.'),
]
for number,name,plan,features,context,position in profiles:
    top=y-24
    C.setFillColor(TEAL);C.setFont('SegoeBold',12);C.drawString(M,top-2,number)
    yy=para(f'{name} <font color="#526775" size="11">{plan}</font>',M+36,top+8,CW-36,size=17,bold=True,color=NAVY)
    yy=para('<b>Published features</b>  '+escape(features),M+36,yy-12,CW-36,size=10)
    yy=para('<b>Additional plan context</b>  '+escape(context),M+36,yy-9,CW-36,size=9.5)
    yy=para('<b>Positioning interpretation</b>  '+escape(position),M+36,yy-9,CW-36,size=9.5,color=MUTED)
    C.setStrokeColor(LINE);C.line(M,yy-15,W-M,yy-15)
    y=yy-15
assert y>92,('Page 2 overflow',y)
C.showPage()

# Page 3: evidence trail, methodology and limits, visible in the gallery preview.
frame(3,'03  /  Evidence and scope')
label('Sources & Methodology',H-78)
y=para('An explicit evidence trail',M,H-99,size=24,bold=True,color=NAVY)
y=para('All three official pricing pages were consulted on <b>6 October 2026</b>. This report preserves that dated snapshot; it does not claim live checkout verification.',M,y-17,size=10.3)
sources=[('1','Calendly','https://calendly.com/pricing'),('2','SavvyCal','https://savvycal.com/pricing'),('3','Cal.com','https://cal.com/pricing')]
for n,name,url in sources:
    y=para(f'<b>[{n}] {name} - official pricing</b><br/><a href="{url}" color="#087E82">{url}</a><br/><font size="9" color="#526775">Access date: 6 October 2026</font>',M,y-19,size=10.2)
label('Methodology',y-30)
y=para('Public desk research of one official pricing page per competitor. Selected offer: Calendly Standard, SavvyCal Basic and Cal.com Teams. Supporting free-tier and SavvyCal Premium details are included only where stated in the source snapshot.',M,y-45)
y=para('Displayed prices are preserved with their stated units and billing labels. Ambiguous or unconfirmed information is marked <b>UNKNOWN</b>. Vendor statements are separated from positioning interpretations; no normalized price ranking is calculated.',M,y-12)
label('Limits and unknown information',y-30)
y=para('<b>UNKNOWN:</b> definitive currency codes and tax treatment for the selected offers; monthly-payment amounts for Calendly and Cal.com; SavvyCal’s active billing selection and amount due upfront.',M,y-45)
y=para('No product testing, account creation, checkout, sales contact or paid subscription was performed. Reliability, usability and commercial outcomes are <b>UNKNOWN</b>. A missing feature in this report does not establish its absence from a product.',M,y-12)
y=para('Prices can change or vary by location and billing selection. Before a purchasing decision, validate the current plan, currency, checkout total, tax treatment and required features.',M,y-12)
assert y>92,('Page 3 overflow',y)
C.save()

reader=PdfReader(OUT)
assert len(reader.pages)==3
text='\n'.join(p.extract_text() for p in reader.pages)
for required in ['Calendly','SavvyCal','Cal.com','UNKNOWN','Sources & Methodology',DISCLAIMER]:
    assert required.casefold() in text.casefold(),('Missing required content',required)
for forbidden in ['Aurum','Codex','Ollama','524,288','AI assistance','GET tool']:
    assert forbidden not in text,('Internal note retained',forbidden)
uris=[]
for page in reader.pages:
    for a in page.get('/Annots',[]):
        obj=a.get_object();action=obj.get('/A',{})
        if '/URI' in action: uris.append(action['/URI'])
assert set(uris)=={s[2] for s in sources},uris
print(f'Created {OUT}: 3 pages, {OUT.stat().st_size} bytes; required content and 3 source hyperlinks verified.')
