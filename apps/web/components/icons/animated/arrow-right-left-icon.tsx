'use client';

import Lottie from 'lottie-react';

// Arrow Right Left/Transfer icon animation
const arrowRightLeftAnimation = {"v":"5.6.5","fr":30,"ip":0,"op":30,"w":32,"h":32,"nm":"transfer","ddd":0,"assets":[],"layers":[{"ddd":0,"ind":1,"ty":4,"nm":"transfer","sr":1,"ks":{"o":{"a":0,"k":100},"r":{"a":0,"k":0},"p":{"a":0,"k":[16,16,0]},"a":{"a":0,"k":[12,12,0]},"s":{"a":0,"k":[100,100,100]}},"ao":0,"shapes":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[-8,0],[8,0]],"c":false}},"nm":"Line Top"},{"ty":"st","c":{"a":0,"k":[0.6,0.4,0.96,1]},"o":{"a":0,"k":100},"w":{"a":0,"k":2},"lc":2,"lj":2,"nm":"Stroke"},{"ty":"tr","p":{"a":1,"k":[{"i":{"x":0.3,"y":1},"o":{"x":0.7,"y":0},"t":0,"s":[12,9]},{"i":{"x":0.3,"y":1},"o":{"x":0.7,"y":0},"t":15,"s":[14,9]},{"t":30,"s":[12,9]}]},"a":{"a":0,"k":[0,0]},"s":{"a":0,"k":[100,100]},"r":{"a":0,"k":0},"o":{"a":0,"k":100}}],"nm":"Line Top"},{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0]],"v":[[4,-3],[8,0],[4,3]],"c":false}},"nm":"Arrow R"},{"ty":"st","c":{"a":0,"k":[0.6,0.4,0.96,1]},"o":{"a":0,"k":100},"w":{"a":0,"k":2},"lc":2,"lj":2,"nm":"Stroke"},{"ty":"tr","p":{"a":1,"k":[{"i":{"x":0.3,"y":1},"o":{"x":0.7,"y":0},"t":0,"s":[12,9]},{"i":{"x":0.3,"y":1},"o":{"x":0.7,"y":0},"t":15,"s":[14,9]},{"t":30,"s":[12,9]}]},"a":{"a":0,"k":[0,0]},"s":{"a":0,"k":[100,100]},"r":{"a":0,"k":0},"o":{"a":0,"k":100}}],"nm":"Arrow R"},{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[8,0],[-8,0]],"c":false}},"nm":"Line Bottom"},{"ty":"st","c":{"a":0,"k":[0.6,0.4,0.96,1]},"o":{"a":0,"k":100},"w":{"a":0,"k":2},"lc":2,"lj":2,"nm":"Stroke"},{"ty":"tr","p":{"a":1,"k":[{"i":{"x":0.3,"y":1},"o":{"x":0.7,"y":0},"t":0,"s":[12,15]},{"i":{"x":0.3,"y":1},"o":{"x":0.7,"y":0},"t":15,"s":[10,15]},{"t":30,"s":[12,15]}]},"a":{"a":0,"k":[0,0]},"s":{"a":0,"k":[100,100]},"r":{"a":0,"k":0},"o":{"a":0,"k":100}}],"nm":"Line Bottom"},{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0]],"v":[[-4,-3],[-8,0],[-4,3]],"c":false}},"nm":"Arrow L"},{"ty":"st","c":{"a":0,"k":[0.6,0.4,0.96,1]},"o":{"a":0,"k":100},"w":{"a":0,"k":2},"lc":2,"lj":2,"nm":"Stroke"},{"ty":"tr","p":{"a":1,"k":[{"i":{"x":0.3,"y":1},"o":{"x":0.7,"y":0},"t":0,"s":[12,15]},{"i":{"x":0.3,"y":1},"o":{"x":0.7,"y":0},"t":15,"s":[10,15]},{"t":30,"s":[12,15]}]},"a":{"a":0,"k":[0,0]},"s":{"a":0,"k":[100,100]},"r":{"a":0,"k":0},"o":{"a":0,"k":100}}],"nm":"Arrow L"}],"ip":0,"op":30,"st":0,"bm":0}],"markers":[]};

interface ArrowRightLeftIconProps {
  className?: string;
  size?: number;
  loop?: boolean;
  autoplay?: boolean;
}

export function ArrowRightLeftIcon({ 
  className = '', 
  size = 24, 
  loop = true, 
  autoplay = true 
}: ArrowRightLeftIconProps) {
  return (
    <Lottie
      animationData={arrowRightLeftAnimation}
      loop={loop}
      autoplay={autoplay}
      style={{ width: size, height: size }}
      className={className}
    />
  );
}

export default ArrowRightLeftIcon;
