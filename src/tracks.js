// Three circuits, each a tribute to a real one. Points are control vertices
// [x, z, y] fed to a closed Catmull-Rom spline.
export const TRACKS = [
  {
    name: 'GRÜNERING NORDSCHLEIFE',
    insp: 'Inspired by the Nürburgring Nordschleife — green forest, brutal elevation, 170 idea-of corners.',
    blurb: '3.2 km of hill-and-forest torture. Ride the curbs on the Bergwerk climb, brake late into the forest hairpin.',
    width: 7.5, topSpeedCap: 1.0, walls: true,
    sky: 0x8fa8b8, fog: 0x9db4c2, ground: 0x3e6b33,
    scenery: { trees: 340, hills: 26, stands: 2 },
    pts: [
      [540,160,0],[521,252,0],[490,338,1],[451,421,2],
      [371,471,3],[282,493,5],[198,493,7],[126,493,9],
      [60,540,11],[-24,582,13],[-112,576,15],[-179,518,16],
      [-209,429,15],[-189,327,13],[-189,263,14],[-264,224,13],
      [-330,160,12],[-352,78,9],[-310,7,7],[-223,-29,5],
      [-145,-45,4],[-118,-106,3],[-85,-191,2],[-24,-262,1],
      [60,-280,0],[140,-242,-1],[225,-237,-1],[316,-222,0],
      [403,-183,0],[467,-112,1],[508,-26,1],[531,66,0],
    ],
  },
  {
    name: 'SAKURA CIRCUIT 8',
    insp: 'Inspired by Suzuka — the figure-eight crossover, the S-curve esses and a flat-out 130R.',
    blurb: 'The only figure-eight on the calendar. The bridge crossing decides who blinks. Long open throttles into the esses.',
    width: 8, topSpeedCap: 1.05, walls: true,
    sky: 0x7ec3e8, fog: 0x9fd2ee, ground: 0x4a7d3a,
    scenery: { trees: 120, hills: 10, stands: 3 },
    pts: [
      [700,-120,0],[760,0,0],[700,140,1],[560,200,2],[420,160,3],
      [360,60,6],[300,-60,8],[180,-120,6],[60,-80,3],[0,20,1],
      [40,140,0],[160,200,0],[300,160,0],[340,120,0],[360,20,0],
      [400,-80,0],[440,-180,0],[580,-190,0],
    ],
  },
  {
    name: 'AUTODROMO VELOCE',
    insp: 'Inspired by Monza — the Temple of Speed: long straights, hard chicanes, banking-ghost Parabolica.',
    blurb: 'Wide, fast and mean. Sixth gear to the first chicane, triple-clip the chicanes, carry every metre of Parabolica.',
    width: 9, topSpeedCap: 1.12, walls: true,
    sky: 0xa8c4da, fog: 0xbccfe0, ground: 0x567a3e,
    scenery: { trees: 90, hills: 8, stands: 4 },
    pts: [
      [-574,-110,0],[-374,-105,0],[-174,-100,0],[26,-95,0],[226,-90,0],
      [400,-70,0],[540,10,0],[560,150,0],[500,280,0],[400,360,0],
      [300,320,0],[200,400,0],[80,420,0],[-80,450,0],[-180,430,0],
      [-260,370,0],[-340,290,0],[-430,240,0],[-520,180,0],[-590,100,0],
      [-595,30,0],[-605,-35,0],[-600,-75,0],
    ],
  },
];
