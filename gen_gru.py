import math
from check_tracks import catmull_centripetal

# polar-star authoring: theta strictly increasing => loop is star-shaped about
# the center => cannot self-intersect, closure is automatic.
TH = [i * 360/32 for i in range(32)]
R = [480,470,465,470, 440,400,360,340, 380,430,450,430,
     380,300,270,330, 390,420,400,340, 290,320,380,430,
     440,410,430,460, 485,490,485,480]
Y = [0,0,1,2, 3,5,7,9, 11,13,15,16, 15,13,14,13, 12,9,7,5,
     4,3,2,1, 0,-1,-1,0, 0,1,1,0]
CX, CZ = 60, 160

pts = []
for t, r, y in zip(TH, R, Y):
    a = math.radians(t)
    pts.append([round(CX + r*math.cos(a)), round(CZ + r*math.sin(a)), y])

s = catmull_centripetal(pts, 12)
n = len(s)
L = sum(math.dist(s[i], s[(i+1) % n]) for i in range(n))
rs = []
for i in range(n):
    a, b, c = s[i], s[(i+1) % n], s[(i+2) % n]
    area = abs((b[0]-a[0])*(c[1]-a[1]) - (c[0]-a[0])*(b[1]-a[1])) / 2
    if area < 1e-6:
        rs.append((1e9, i)); continue
    rs.append((math.dist(a,b)*math.dist(b,c)*math.dist(a,c)/(4*area), i))
rs.sort()
worst = 1e9; wp=None
for i in range(n):
    for j in range(i+1, n):
        gap = min(abs(i-j), n-abs(i-j))
        if gap < 20: continue
        d = math.hypot(s[i][0]-s[j][0], s[i][1]-s[j][1])
        if d < worst: worst, wp = d, (i,j)
print(f"len={L:.0f} tightest={[(round(R),i) for R,i in rs[:5]]} approach={worst:.0f}m")
rows = []
for i in range(0, 32, 4):
    rows.append('      ' + ','.join(f'[{p[0]},{p[1]},{p[2]}]' for p in pts[i:i+4]) + ',')
print('\n'.join(rows).rstrip(','))
