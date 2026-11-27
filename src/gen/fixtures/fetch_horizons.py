"""Fetches the sprint-1 Horizons fixture vectors and writes src/gen/fixtures/horizons.ts.

Usage: python3 src/gen/fixtures/fetch_horizons.py src/gen/fixtures/horizons.ts <capture date>
Needs network access. The numbers are written exactly as Horizons prints them.
"""
import json, math, sys, time, urllib.parse, urllib.request

API = 'https://ssd.jpl.nasa.gov/api/horizons.api'
COMMON = dict(format='json', EPHEM_TYPE='VECTORS', REF_PLANE='ECLIPTIC', REF_SYSTEM='ICRF',
              OUT_UNITS='KM-S', TIME_TYPE='TDB', VEC_TABLE='2', CSV_FORMAT='YES', OBJ_DATA='NO')

def jd(y, m, d, h=0.0):  # Meeus, as src/math/time.ts
    greg = (y, m, d) >= (1582, 10, 15)
    Y, M = (y - 1, m + 12) if m <= 2 else (y, m)
    B = 0
    if greg:
        A = math.floor(Y / 100); B = 2 - A + math.floor(A / 4)
    return math.floor(365.25 * (Y + 4716)) + math.floor(30.6001 * (M + 1)) + d + B - 1524.5 + h / 24

EPOCHS = {'1000 BC Jan 1': jd(-999, 1, 1), 'J2000': 2451545.0, '2050 Jan 1': jd(2050, 1, 1),
          '2500 Jan 1': jd(2500, 1, 1), '2950 Jan 1': jd(2950, 1, 1)}
MOON_EPOCHS = {'J2000': 2451545.0, '2025 Jan 1': jd(2025, 1, 1)}

def query(command, center, jds):
    params = dict(COMMON, COMMAND=f"'{command}'", CENTER=f"'{center}'",
                  TLIST=' '.join(f"'{j:.1f}'" for j in jds))
    url = API + '?' + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=120) as resp:
                d = json.load(resp)
            break
        except Exception as e:
            print('retry', command, e, file=sys.stderr); time.sleep(3)
    r = d['result']
    if '$$SOE' not in r:
        raise SystemExit(f'No data for {command}@{center}:\n{r[-1500:]}')
    rows = []
    for line in r[r.index('$$SOE') + 5:r.index('$$EOE')].strip().splitlines():
        f = [x.strip() for x in line.split(',')]
        rows.append(dict(target=command, center=center, jd=f[0], r=f[2:5], v=f[5:8]))
    return rows

planets = []
for target, name in [('1', 'Mercury barycentre'), ('2', 'Venus barycentre'), ('3', 'Earth-Moon barycentre'),
                     ('4', 'Mars barycentre'), ('5', 'Jupiter barycentre'), ('6', 'Saturn barycentre'),
                     ('7', 'Uranus barycentre'), ('8', 'Neptune barycentre'), ('9', 'Pluto barycentre')]:
    planets += query(target, '500@10', list(EPOCHS.values()))
earth = query('399', '500@10', [2451545.0])
moons = []
for target, center in [('301', '500@399'), ('401', '500@499'), ('402', '500@499'),
                       ('501', '500@599'), ('502', '500@599'), ('503', '500@599'), ('504', '500@599'),
                       ('601', '500@699'), ('602', '500@699'), ('603', '500@699'), ('604', '500@699'),
                       ('605', '500@699'), ('606', '500@699'), ('608', '500@699'),
                       ('705', '500@799'), ('701', '500@799'), ('702', '500@799'), ('703', '500@799'),
                       ('704', '500@799'), ('801', '500@899'), ('901', '500@999')]:
    moons += query(target, center, list(MOON_EPOCHS.values()))

def ts_rows(rows):
    out = []
    for x in rows:
        out.append(f"  {{ target: '{x['target']}', center: '{x['center']}', jd: {x['jd']}, "
                   f"r: [{', '.join(x['r'])}], v: [{', '.join(x['v'])}] }},")
    return '\n'.join(out)

example = API + '?' + urllib.parse.urlencode(dict(COMMON, COMMAND="'4'", CENTER="'500@10'", TLIST="'2451545.0'"))
captured = sys.argv[2]
ts = f"""/**
 * Reference state vectors from JPL Horizons, pinned so that tests never use the network.
 *
 * Captured {captured} from the Horizons API ({API}) by a one-off script, with
 * EPHEM_TYPE=VECTORS, REF_PLANE=ECLIPTIC, REF_SYSTEM=ICRF, OUT_UNITS=KM-S, TIME_TYPE=TDB,
 * VEC_TABLE=2, CSV_FORMAT=YES and OBJ_DATA=NO. Each entry records its COMMAND (target), CENTER
 * and TLIST time (JD TDB). The numbers are copied verbatim from the output. For example, Mars's
 * barycentre at J2000 is:
 *
 * {example}
 *
 * Planets use the system barycentres (targets 1–9; 3 is the Earth–Moon barycentre), because
 * Horizons gives the planet centres (199–999) only over the satellite ephemerides' spans
 * (about 1600–2200), and Tables 2a/2b are fitted to the barycentres anyway. Epochs (TDB):
{chr(10).join(f' *   {k}: {v:.1f}' for k, v in EPOCHS.items())}
 *
 * Moons are centred on their planet (500@399, 500@499, …) at J2000 and 2025 Jan 1 ({MOON_EPOCHS['2025 Jan 1']:.1f}).
 */

export interface HorizonsVector {{
  /** Horizons COMMAND. */
  target: string;
  /** Horizons CENTER. */
  center: string;
  /** JD, TDB. */
  jd: number;
  /** km, ecliptic and mean equinox of J2000. */
  r: [number, number, number];
  /** km/s */
  v: [number, number, number];
}}

export const HORIZONS_EPOCHS = {json.dumps(EPOCHS, indent=2)} as const;

export const HORIZONS_MOON_EPOCHS = {json.dumps(MOON_EPOCHS, indent=2)} as const;

/** Planet system barycentres, centred on the Sun, at HORIZONS_EPOCHS. */
// prettier-ignore
export const HORIZONS_PLANETS: readonly HorizonsVector[] = [
{ts_rows(planets)}
];

/** Earth (399), centred on the Sun, at J2000 (S1-4). */
// prettier-ignore
export const HORIZONS_EARTH: readonly HorizonsVector[] = [
{ts_rows(earth)}
];

/** Moons, centred on their planet, at HORIZONS_MOON_EPOCHS. */
// prettier-ignore
export const HORIZONS_MOONS: readonly HorizonsVector[] = [
{ts_rows(moons)}
];
"""
open(sys.argv[1], 'w').write(ts)
print(len(planets), len(earth), len(moons))
