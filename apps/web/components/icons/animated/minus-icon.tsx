'use client';

import Lottie from 'lottie-react';

// Minus/Negative Sentiment icon animation
const minusAnimation = {"v":"5.6.5","fr":30,"ip":0,"op":30,"w":32,"h":32,"nm":"minus","ddd":0,"assets":[],"layers":[{"ddd":0,"ind":1,"ty":4,"nm":"minus","sr":1,"ks":{"o":{"a":0,"k":100},"r":{"a":0,"k":0},"p":{"a":0,"k":[16,16,0]},"a":{"a":0,"k":[12,12,0]},"s":{"a":1,"k":[{"i":{"x":[0.3,0.3,0.3],"y":[1,1,1]},"o":{"x":[0.7,0.7,0.7],"y":[0,0,0]},"t":0,"s":[100,100,100]},{"i":{"x":[0.3,0.3,0.3],"y":[1,1,1]},"o":{"x":[0.7,0.7,0.7],"y":[0,0,0]},"t":15,"s":[90,100,100]},{"t":30,"s":[100,100,100]}]}},"ao":0,"shapes":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[-6,0],[6,0]],"c":false}},"nm":"H"},{"ty":"st","c":{"a":0,"k":[0.96,0.26,0.21,1]},"o":{"a":0,"k":100},"w":{"a":0,"k":3},"lc":2,"lj":2,"nm":"Stroke"},{"ty":"tm","s":{"a":1,"k":[{"i":{"x":[0.3],"y":[1]},"o":{"x":[0.7],"y":[0]},"t":0,"s":[50]},{"i":{"x":[0.3],"y":[1]},"o":{"x":[0.7],"y":[0]},"t":15,"s":[0]},{"t":30,"s":[50]}]},"e":{"a":1,"k":[{"i":{"x":[0.3],"y":[1]},"o":{"x":[0.7],"y":[0]},"t":0,"s":[50]},{"i":{"x":[0.3],"y":[1]},"o":{"x":[0.7],"y":[0]},"t":15,"s":[100]},{"t":30,"s":[50]}]},"o":{"a":0,"k":0},"m":1,"nm":"Trim"},{"ty":"tr","p":{"a":0,"k":[12,12]},"a":{"a":0,"k":[0,0]},"s":{"a":0,"k":[100,100]},"r":{"a":0,"k":0},"o":{"a":0,"k":100}}],"nm":"H"}],"ip":0,"op":30,"st":0,"bm":0}],"markers":[]};

interface MinusIconProps {
  className?: string;
  size?: number;
  loop?: boolean;
  autoplay?: boolean;
}

export function MinusIcon({ 
  className = '', 
  size = 24, 
  loop = true, 
  autoplay = true 
}: MinusIconProps) {
  return (
    <Lottie
      animationData={minusAnimation}
      loop={loop}
      autoplay={autoplay}
      style={{ width: size, height: size }}
      className={className}
    />
  );
}

export default MinusIcon;
