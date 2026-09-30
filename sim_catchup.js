// Catch-up balance check: seat fairness, comeback rate, income gap. Run: node sim_catchup.js
const E=require('./src/engine.js'),M=require('./src/meta.js');
E.CFG.quoteSims=2;
const PRI=['flush','takeover','jackpot','ticket','fake','joker','aces','court','stack','draft','sling','stride','wind','marked','retread','horseshoe','dice','chaos','sand','rich','interest','penny','spare','lens','insure','haggler','bookie','roller','coin','slam','sabotage','headstart','cut','double','slip','allin','sponsor'];
function shop(run){let g=0;while(g++<40){let b=null;run.shop.forEach((o,i)=>{if(o.sold||E.priceOf(run,o.id)>E.spendable(run))return;const p=PRI.indexOf(o.id);if(!b||p<b.p)b={i,p};});if(!b)break;E.buy(run,b.i);}}
function play(seed,me,laps,{buy,traps,diff=0}){
  const run=E.newRun({me,laps,seed,meta:M.effects(M.fresh()),diff});run.auto=true;const places=[];let lastAt2=false,income=[0,0,0,0,0];
  while(run.phase!=='over'){run.calls=[null,null,null,null];E.startLap(run);let n=0;
    while(!run.lap.done){E.stepLap(run,0.05);n++;if(traps&&run.lap.traps>0&&n%60===30)E.trap(run);}
    const r=E.endLap(run);places.push(r.place);income[r.place]+=r.total;
    if(run.phase==='shop'&&buy)shop(run);
    if(run.lapNo===2&&run.phase==='shop'&&E.runOrder(run).indexOf(me)===3)lastAt2=true;}
  return {run,places,lastAt2,income};
}
function go(label,o,N=300){
  const seat=[0,0,0,0],lp=[0,0,0,0];let tot=0,champ=0,l2=0,l2c=0,inc=[0,0,0,0,0],cnt=[0,0,0,0,0],comeb=0,avgTrapHit=0,tr=0;
  for(let me=0;me<4;me++)for(let i=0;i<N;i++){const {run,places,lastAt2,income}=play(500+i,me,o.laps||5,o);
    const r=run.result;seat[me]+=r.champion;places.forEach(p=>lp[me]+=p);tot++;champ+=r.champion;
    if(lastAt2){l2++;l2c+=r.champion}
    run.history.forEach(h=>{inc[h.place]+=h.total;cnt[h.place]++});comeb+=r.stats.comeback?1:0;tr+=r.stats.traps;avgTrapHit+=r.stats.trapHits;}
  console.log(label.padEnd(22),'champ',(champ/tot).toFixed(2),'seats',seat.map(x=>(x/N).toFixed(2)).join('/'),'lapPl',lp.map(x=>(x/N/(o.laps||5)).toFixed(2)).join('/'),'lastAt2 champ',(l2c/Math.max(1,l2)).toFixed(2),'('+l2+')','inc1:4',(inc[1]/cnt[1]).toFixed(0)+':'+(inc[4]/cnt[4]).toFixed(0),'comeback',(comeb/tot).toFixed(2),'trapHit',tr?(avgTrapHit/tr).toFixed(2):'-');
}
go("no buy",{buy:false});
go('greedy+traps',{buy:true,traps:true});
