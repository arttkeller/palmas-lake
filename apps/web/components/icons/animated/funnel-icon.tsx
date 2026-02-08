'use client';

import Lottie from 'lottie-react';

// Funnel/Conversion icon animation
const funnelAnimation = {"v":"5.6.5","fr":30,"ip":0,"op":30,"w":32,"h":32,"nm":"funnel","ddd":0,"assets":[],"layers":[{"ddd":0,"ind":1,"ty":4,"nm":"funnel","sr":1,"ks":{"o":{"a":0,"k":100},"r":{"a":0,"k":0},"p":{"a":0,"k":[16,16,0]},"a":{"a":0,"k":[12,12,0]},"s":{"a":0,"k":[100,100,100]}},"ao":0,"shapes":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[-8,-6],[8,-6],[2,2],[2,8],[-2,8]],"c":true}},"nm":"Funnel"},{"ty":"st","c":{"a":0,"k":[0.97,0.46,0.09,1]},"o":{"a":0,"k":100},"w":{"a":0,"k":2},"lc":2,"lj":2,"nm":"Stroke"},{"ty":"tm","s":{"a":0,"k":0},"e":{"a":1,"k":[{"i":{"x":[0.3],"y":[1]},"o":{"x":[0.7],"y":[0]},"t":0,"s":[0]},{"t":20,"s":[100]}]},"o":{"a":0,"k":0},"m":1,"nm":"Trim"},{"ty":"tr","p":{"a":0,"k":[12,12]},"a":{"a":0,"k":[0,0]},"s":{"a":0,"k":[100,100]},"r":{"a":0,"k":0},"o":{"a":0,"k":100}}],"nm":"Funnel"},{"ty":"gr","it":[{"ty":"el","s":{"a":0,"k":[3,3]},"p":{"a":0,"k":[0,0]},"nm":"Dot"},{"ty":"fl","c":{"a":0,"k":[0.97,0.46,0.09,1]},"o":{"a":0,"k":100},"nm":"Fill"},{"ty":"tr","p":{"a":1,"k":[{"i":{"x":0.3,"y":1},"o":{"x":0.7,"y":0},"t":5,"s":[12,6]},{"i":{"x":0.3,"y":1},"o":{"x":0.7,"y":0},"t":15,"s":[12,12]},{"t":25,"s":[12,18]}]},"a":{"a":0,"k":[0,0]},"s":{"a":1,"k":[{"i":{"x":[0.3,0.3],"y":[1,1]},"o":{"x":[0.7,0.7],"y":[0,0]},"t":5,"s":[100,100]},{"i":{"x":[0.3,0.3],"y":[1,1]},"o":{"x":[0.7,0.7],"y":[0,0]},"t":15,"s":[80,80]},{"t":25,"s":[0,0]}]},"r":{"a":0,"k":0},"o":{"a":1,"k":[{"i":{"x":[0.3],"y":[1]},"o":{"x":[0.7],"y":[0]},"t":5,"s":[100]},{"t":25,"s":[0]}]}}],"nm":"Drop"}],"ip":0,"op":30,"st":0,"bm":0}],"markers":[]};

interface FunnelIconProps {
  className?: string;
  size?: number;
  loop?: boolean;
  autoplay?: boolean;
}

export function FunnelIcon({ 
  className = '', 
  size = 24, 
  loop = true, 
  autoplay = true 
}: FunnelIconProps) {
  return (
    <Lottie
      animationData={funnelAnimation}
      loop={loop}
      autoplay={autoplay}
      style={{ width: size, height: size }}
      className={className}
    />
  );
}

export default FunnelIcon;
