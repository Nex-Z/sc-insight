export function rankVariant(line){
 const resolution=line.match(/RESOLUTION=(\d+)x(\d+)/),fps=Number(line.match(/FRAME-RATE=([\d.]+)/)?.[1]||0),bandwidth=Number(line.match(/(?:[:,])BANDWIDTH=(\d+)/)?.[1]||0);
 return {pixels:resolution?Number(resolution[1])*Number(resolution[2]):0,fps,bandwidth};
}
export function highestQuality(a,b){return b.pixels-a.pixels||b.fps-a.fps||b.bandwidth-a.bandwidth;}
