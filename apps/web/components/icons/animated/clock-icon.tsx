'use client';

import Lottie from 'lottie-react';

// Clock/Heatmap icon animation
const clockAnimation = {"v":"5.6.5","fr":30,"ip":0,"op":30,"w":32,"h":32,"nm":"clock","ddd":0,"assets":[],"layers":[{"ddd":0,"ind":1,"ty":4,"nm":"clock","sr":1,"ks":{"o":{"a":0,"k":100},"r":{"a":0,"k":0},"p":{"a":0,"k":[16,16,0]},"a":{"a":0,"k":[12,12,0]},"s":{"a":0,"k":[100,100,100]}},"ao":0,"shapes":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,-5.523],[5.523,0],[0,5.523],[-5.523,0]],"o":[[0,5.523],[-5.523,0],[0,-5.523],[5.523,0]],"v":[[10,0],[0,10],[-10,0],[0,-10]],"c":true}},"nm":"Circle"},{"ty":"st","c":{"a":0,"k":[0.4,0.4,0.96,1]},"o":{"a":0,"k":100},"w":{"a":0,"k":2},"lc":2,"lj":2,"nm":"Stroke"},{"ty":"tr","p":{"a":0,"k":[12,12]},"a":{"a":0,"k":[0,0]},"s":{"a":0,"k":[100,100]},"r":{"a":0,"k":0},"o":{"a":0,"k":100}}],"nm":"Circle"},{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[0,-5],[0,0]],"c":false}},"nm":"Hour"},{"ty":"st","c":{"a":0,"k":[0.4,0.4,0.96,1]},"o":{"a":0,"k":100},"w":{"a":0,"k":2},"lc":2,"lj":2,"nm":"Stroke"},{"ty":"tr","p":{"a":0,"k":[12,12]},"a":{"a":0,"k":[0,0]},"s":{"a":0,"k":[100,100]},"r":{"a":1,"k":[{"i":{"x":[0.3],"y":[1]},"o":{"x":[0.7],"y":[0]},"t":0,"s":[0]},{"t":30,"s":[360]}]},"o":{"a":0,"k":100}}],"nm":"Hour"},{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[0,0],[4,0]],"c":false}},"nm":"Minute"},{"ty":"st","c":{"a":0,"k":[0.4,0.4,0.96,1]},"o":{"a":0,"k":100},"w":{"a":0,"k":2},"lc":2,"lj":2,"nm":"Stroke"},{"ty":"tr","p":{"a":0,"k":[12,12]},"a":{"a":0,"k":[0,0]},"s":{"a":0,"k":[100,100]},"r":{"a":1,"k":[{"i":{"x":[0.3],"y":[1]},"o":{"x":[0.7],"y":[0]},"t":0,"s":[0]},{"t":30,"s":[720]}]},"o":{"a":0,"k":100}}],"nm":"Minute"}],"ip":0,"op":30,"st":0,"bm":0}],"markers":[]};

interface ClockIconProps {
  className?: string;
  size?: number;
  loop?: boolean;
  autoplay?: boolean;
}

export function ClockIcon({ 
  className = '', 
  size = 24, 
  loop = true, 
  autoplay = true 
}: ClockIconProps) {
  return (
    <Lottie
      animationData={clockAnimation}
      loop={loop}
      autoplay={autoplay}
      style={{ width: size, height: size }}
      className={className}
    />
  );
}

export default ClockIcon;
