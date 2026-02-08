'use client';

import Lottie from 'lottie-react';

// Plus/Positive Sentiment icon animation
const plusAnimation = {"v":"5.6.5","fr":30,"ip":0,"op":30,"w":32,"h":32,"nm":"plus","ddd":0,"assets":[],"layers":[{"ddd":0,"ind":1,"ty":4,"nm":"plus","sr":1,"ks":{"o":{"a":0,"k":100},"r":{"a":1,"k":[{"i":{"x":[0.3],"y":[1]},"o":{"x":[0.7],"y":[0]},"t":0,"s":[0]},{"i":{"x":[0.3],"y":[1]},"o":{"x":[0.7],"y":[0]},"t":15,"s":[90]},{"t":30,"s":[0]}]},"p":{"a":0,"k":[16,16,0]},"a":{"a":0,"k":[12,12,0]},"s":{"a":1,"k":[{"i":{"x":[0.3,0.3,0.3],"y":[1,1,1]},"o":{"x":[0.7,0.7,0.7],"y":[0,0,0]},"t":0,"s":[100,100,100]},{"i":{"x":[0.3,0.3,0.3],"y":[1,1,1]},"o":{"x":[0.7,0.7,0.7],"y":[0,0,0]},"t":15,"s":[110,110,100]},{"t":30,"s":[100,100,100]}]}},"ao":0,"shapes":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[0,-6],[0,6]],"c":false}},"nm":"V"},{"ty":"st","c":{"a":0,"k":[0.06,0.73,0.51,1]},"o":{"a":0,"k":100},"w":{"a":0,"k":3},"lc":2,"lj":2,"nm":"Stroke"},{"ty":"tr","p":{"a":0,"k":[12,12]},"a":{"a":0,"k":[0,0]},"s":{"a":0,"k":[100,100]},"r":{"a":0,"k":0},"o":{"a":0,"k":100}}],"nm":"V"},{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[-6,0],[6,0]],"c":false}},"nm":"H"},{"ty":"st","c":{"a":0,"k":[0.06,0.73,0.51,1]},"o":{"a":0,"k":100},"w":{"a":0,"k":3},"lc":2,"lj":2,"nm":"Stroke"},{"ty":"tr","p":{"a":0,"k":[12,12]},"a":{"a":0,"k":[0,0]},"s":{"a":0,"k":[100,100]},"r":{"a":0,"k":0},"o":{"a":0,"k":100}}],"nm":"H"}],"ip":0,"op":30,"st":0,"bm":0}],"markers":[]};

interface PlusIconProps {
  className?: string;
  size?: number;
  loop?: boolean;
  autoplay?: boolean;
}

export function PlusIcon({ 
  className = '', 
  size = 24, 
  loop = true, 
  autoplay = true 
}: PlusIconProps) {
  return (
    <Lottie
      animationData={plusAnimation}
      loop={loop}
      autoplay={autoplay}
      style={{ width: size, height: size }}
      className={className}
    />
  );
}

export default PlusIcon;
