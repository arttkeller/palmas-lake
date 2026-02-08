'use client';

import Lottie from 'lottie-react';

// Chart/Conversion Rate icon animation
const chartAnimation = {"v":"5.6.5","fr":30,"ip":0,"op":30,"w":32,"h":32,"nm":"chart","ddd":0,"assets":[],"layers":[{"ddd":0,"ind":1,"ty":4,"nm":"chart","sr":1,"ks":{"o":{"a":0,"k":100},"r":{"a":0,"k":0},"p":{"a":0,"k":[16,16,0]},"a":{"a":0,"k":[12,12,0]},"s":{"a":0,"k":[100,100,100]}},"ao":0,"shapes":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[-8,8],[-8,-8],[8,-8],[8,8],[-8,8]],"c":false}},"nm":"Axes"},{"ty":"st","c":{"a":0,"k":[0.06,0.73,0.51,1]},"o":{"a":0,"k":100},"w":{"a":0,"k":2},"lc":2,"lj":2,"nm":"Stroke"},{"ty":"tm","s":{"a":0,"k":0},"e":{"a":1,"k":[{"i":{"x":[0.3],"y":[1]},"o":{"x":[0.7],"y":[0]},"t":0,"s":[0]},{"t":15,"s":[100]}]},"o":{"a":0,"k":0},"m":1,"nm":"Trim"},{"ty":"tr","p":{"a":0,"k":[12,12]},"a":{"a":0,"k":[0,0]},"s":{"a":0,"k":[100,100]},"r":{"a":0,"k":0},"o":{"a":0,"k":100}}],"nm":"Axes"},{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0]],"v":[[-6,4],[-2,-2],[2,2],[6,-6]],"c":false}},"nm":"Line"},{"ty":"st","c":{"a":0,"k":[0.06,0.73,0.51,1]},"o":{"a":0,"k":100},"w":{"a":0,"k":2},"lc":2,"lj":2,"nm":"Stroke"},{"ty":"tm","s":{"a":0,"k":0},"e":{"a":1,"k":[{"i":{"x":[0.3],"y":[1]},"o":{"x":[0.7],"y":[0]},"t":10,"s":[0]},{"t":25,"s":[100]}]},"o":{"a":0,"k":0},"m":1,"nm":"Trim"},{"ty":"tr","p":{"a":0,"k":[12,12]},"a":{"a":0,"k":[0,0]},"s":{"a":0,"k":[100,100]},"r":{"a":0,"k":0},"o":{"a":0,"k":100}}],"nm":"Trend"}],"ip":0,"op":30,"st":0,"bm":0}],"markers":[]};

interface ChartIconProps {
  className?: string;
  size?: number;
  loop?: boolean;
  autoplay?: boolean;
}

export function ChartIcon({ 
  className = '', 
  size = 24, 
  loop = true, 
  autoplay = true 
}: ChartIconProps) {
  return (
    <Lottie
      animationData={chartAnimation}
      loop={loop}
      autoplay={autoplay}
      style={{ width: size, height: size }}
      className={className}
    />
  );
}

export default ChartIcon;
