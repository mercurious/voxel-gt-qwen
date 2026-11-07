import math

def catmull_centripetal(pts, seg=12):
    # Barry-Goldman evaluation, matching THREE.CatmullRomCurve3('centripetal')
    n = len(pts)
    def dist3(a, b):
        return math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2)
    out = []
    for i in range(n):
        P0, P1, P2, P3 = pts[(i-1) % n], pts[i], pts[(i+1) % n], pts[(i+2) % n]
        t0 = 0.0
        t1 = t0 + max(dist3(P0, P1), 1e-4) ** 0.5
        t2 = t1 + max(dist3(P1, P2), 1e-4) ** 0.5
        t3 = t2 + max(dist3(P2, P3), 1e-4) ** 0.5
        for j in range(seg):
            t = t1 + (t2 - t1) * j / seg
            def lp(pa, pb, ta, tb):
                w = (t - ta) / (tb - ta)
                return (pa[0] + (pb[0]-pa[0])*w, pa[1] + (pb[1]-pa[1])*w, pa[2] + (pb[2]-pa[2])*w)
            A1 = lp(P0, P1, t0, t1); A2 = lp(P1, P2, t1, t2); A3 = lp(P2, P3, t2, t3)
            B1 = lp(A1, A2, t0, t2); B2 = lp(A2, A3, t1, t3)
            out.append(lp(B1, B2, t1, t2))
    return out

TRACKS = {
 'GRUERERING': [
      [-100,-200,0],[120,-200,0],[280,-190,1],[400,-140,3],[470,-40,5],
      [490,80,7],[440,180,10],[380,260,12],[400,360,14],[460,450,16],
      [430,550,16],[340,580,15],[270,530,12],[260,440,10],[190,400,8],
      [110,470,7],[40,415,6],[20,320,5],[-60,290,4],[-140,360,5],
      [-175,300,6],[-170,235,6],[-130,160,4],[-190,80,2],[-250,0,1],
      [-240,-100,0],[-180,-170,0]],
 'SAKURA': [
      [700,-120,0],[760,0,0],[700,140,1],[560,200,2],[420,160,3],
      [360,60,6],[300,-60,8],[180,-120,6],[60,-80,3],[0,20,1],
      [40,140,0],[160,200,0],[300,160,0],[340,120,0],[360,20,0],
      [400,-80,0],[440,-180,0],[580,-190,0]],
 'MONZA': [
      [-574,-110,0],[-374,-105,0],[-174,-100,0],[26,-95,0],[226,-90,0],
      [400,-70,0],[540,10,0],[560,150,0],[500,280,0],[400,360,0],
      [300,320,0],[200,400,0],[80,420,0],[-80,450,0],[-180,430,0],
      [-260,370,0],[-340,290,0],[-430,240,0],[-520,180,0],[-590,100,0],
      [-595,30,0],[-605,-35,0],[-600,-75,0]],
}

for name, pts in TRACKS.items():
    s = catmull_centripetal(pts, 12)
    n = len(s)
    L = sum(math.dist(s[i], s[(i+1) % n]) for i in range(n))
    rs = []
    for i in range(n):
        a, b, c = s[i], s[(i+1) % n], s[(i+2) % n]
        ax, ay = a[0], a[1]; bx, by = b[0], b[1]; cx, cy = c[0], c[1]
        area = abs((bx-ax)*(cy-ay) - (cx-ax)*(by-ay)) / 2
        if area < 1e-6:
            rs.append((1e9, i)); continue
        rs.append((math.dist(a,b)*math.dist(b,c)*math.dist(a,c) / (4*area), i))
    rs.sort()
    worst = 1e9; worstPair = None
    for i in range(n):
        for j in range(i+1, n):
            gap = min(abs(i-j), n - abs(i-j))
            if gap < 20: continue
            d = math.hypot(s[i][0]-s[j][0], s[i][1]-s[j][1])
            dy = abs(s[i][2]-s[j][2])
            if dy >= 5: d += 100  # figure-8 bridge passes are fine
            if d < worst: worst, worstPair = d, (i, j)
    print(f"{name}: len={L:.0f}m tightest={[(round(R),i) for R,i in rs[:4]]} closest-approach={worst:.0f}m {worstPair if worst<60 else ''}")
