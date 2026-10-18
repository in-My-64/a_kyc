"""
Static reference data for document classification.

Kept separate from models.py so the ORM module stays focused on schema.
Importable from migrations, management commands, and tests without
pulling in Django.
"""

# Patterns are used with `re.fullmatch`.
#
# Real OCR output splits ID sequences across whitespace and drops the
# trailing digits when they land in a low-confidence region. The
# trailing digit group is therefore optional — better to extract
# `63-2316316 S` than nothing at all.
PATTERNS = {
    "national_id": r"\d{2}[\s-]*\d{6,7}[\s-]*[A-Z](?:[\s-]*\d{1,2})?",
    "passport": r"[A-Z]{2}\d{6}",
    "licence": r"\d{7,8}[A-Z]{1,2}",
}

CONFUSION_MAP = {
    "0": "O", "O": "0",
    "1": "I", "I": "1",
    "l": "1", "L": "1",
    "5": "S", "S": "5",
    "8": "B", "B": "8",
    "2": "Z", "Z": "2",
}

DOC_TYPES = [
    ("national_id", "National ID"),
    ("passport", "Passport"),
    ("licence", "Driver's Licence"),
    ("unknown", "Unknown"),
]

_PATTERN_KEYS = set(PATTERNS.keys())
_DOC_TYPE_KEYS = {key for key, _ in DOC_TYPES}
if not _PATTERN_KEYS <= _DOC_TYPE_KEYS:
    raise RuntimeError(
        "PATTERNS contains keys not present in DOC_TYPES: "
        f"{sorted(_PATTERN_KEYS - _DOC_TYPE_KEYS)}"
    )

ISO_ALPHA2 = frozenset("""
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI
BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN
CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK
FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM
HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN
KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK
ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP
NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW
SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF
TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI
VN VU WF WS YE YT ZA ZM ZW
""".split())

ISO_ALPHA3 = frozenset("""
AND ARE AFG ATG AIA ALB ARM AGO ATA ARG ASM AUT AUS ABW ALA AZE BIH BRB
BGD BEL BFA BGR BHR BDI BEN BLM BMU BRN BOL BES BRA BHS BTN BVT BWA BLR
BLZ CAN CCK COD CAF COG CHE CIV COK CHL CMR CHN COL CRI CUB CPV CUW CXR
CYP CZE DEU DJI DNK DMA DOM DZA ECU EST EGY ESH ERI ESP ETH FIN FJI FLK
FSM FRO FRA GAB GBR GRD GEO GUF GGY GHA GIB GRL GMB GIN GLP GNQ GRC SGS
GTM GUM GNB GUY HKG HMD HND HRV HTI HUN IDN IRL ISR IMN IND IOT IRQ IRN
ISL ITA JEY JAM JOR JPN KEN KGZ KHM KIR COM KNA PRK KOR KWT CYM KAZ LAO
LBN LCA LIE LKA LBR LSO LTU LUX LVA LBY MAR MCO MDA MNE MAF MDG MHL MKD
MLI MMR MNG MAC MNP MTQ MRT MSR MLT MUS MDV MWI MEX MYS MOZ NAM NCL NER
NFK NGA NIC NLD NOR NPL NRU NIU NZL OMN PAN PER PYF PNG PHL PAK POL SPM
PCN PRI PSE PRT PLW PRY QAT REU ROU SRB RUS RWA SAU SLB SYC SDN SWE SGP
SHN SVN SJM SVK SLE SMR SEN SOM SUR SSD STP SLV SXM SYR SWZ TCA TCD ATF
TGO THA TJK TKL TLS TKM TUN TON TUR TTO TUV TWN TZA UKR UGA UMI USA URY
UZB VAT VCT VEN VGB VIR VNM VUT WLF WSM YEM MYT ZAF ZMB ZWE
""".split())