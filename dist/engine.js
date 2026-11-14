const days = [
{title:'A fresh start',story:'Welcome, Commander. Four astronauts are counting on you. An air filter needs servicing, but the science team wants to start an experiment.',why:'Air-cleaning equipment needs electricity and regular care. Fixing a small problem early can prevent a bigger repair.',choices:[['Service the air filter','Spend 12 power. Prevent a breakdown.',-12,8,0,'filter'],['Start the experiment','Spend 8 power. Collect research, but leave the filter worn.',-8,-8,0,'research']]},
{title:'Prepare for tomorrow',story:'Your crew has time for one extra job. Prepare the storm shelter or tend the plants already growing in the greenhouse.',why:'Crew time is limited too. Preparing protection and caring for crops both take work before they bring a benefit.',choices:[['Prepare the shelter','Spend 10 power. Strengthen protection.',-10,0,15,'shelter'],['Tend the greenhouse','Spend 10 power. Prepare a later harvest.',-10,0,0,'crop']]},
{title:'Working in the cold',story:'A shaded surface operation needs heaters. You can collect useful measurements now or keep the battery reserve.',why:'The Moon has large surface temperature differences. Equipment needs thermal control, which can compete with other uses of energy.',choices:[['Power the heaters','Spend 22 power. Collect research.',-22,0,0,'research'],['Postpone the operation','Save your energy for essential equipment.',0,0,0,'reserve']]},
{title:'Solar particle alert',story:'Mission control reports a radiation alert. Everyone will shelter. Decide whether to keep the remote experiment running.',why:'Shelter materials reduce exposure to solar particles. Remote equipment can keep working while astronauts stay protected, but still needs power.',choices:[['Pause research and shelter','Save power. Focus on the crew.',0,0,5,'rest'],['Run research from shelter','Spend 20 power. Collect research.',-20,0,5,'research']]},
{title:'A growing decision',story:'Your plants were growing before this mission. Their lights need energy today. Packaged meals already cover the crew’s food needs.',why:'Plants need light, water and time. A small space garden supplements stored meals, and its equipment shares the outpost’s power supply.',choices:[['Keep the grow lights on','Spend 15 power. Harvest if plants were tended on Day 2.',-15,0,0,'harvest'],['Prioritize life support','Spend 5 power. Improve the air and water systems.',-5,15,0,'support']]},
{title:'A message to Earth',story:'A planned communications window is opening. Send your research or use the energy to service the outpost.',why:'Radio equipment uses electricity. Mission planners schedule communication and maintenance around available energy and crew time.',choices:[['Transmit findings','Spend 16 power. Complete research if you collected it.',-16,0,0,'transmit'],['Service essential systems','Spend 8 power. Restore life support.',-8,20,5,'repair']]},
{title:'Bring the crew home',story:'It is the final day. Choose a careful closeout or one last experiment before the mission ends.',why:'Keeping a reserve helps a crew respond to unexpected problems. A successful mission balances exploration with a safe finish.',choices:[['Complete safety checks','Spend 5 power. Improve readiness.',-5,10,10,'closeout'],['Finish one last experiment','Spend 25 power. Add research to the mission log.',-25,0,0,'research']]}
];
function initial(){return {day:0,power:85,life:75,safety:70,flags:[],log:[],ended:false};}
function decide(state,index){
 if(state.ended || !days[state.day]?.choices[index]) return state;
 const s=JSON.parse(JSON.stringify(state)), d=days[s.day], c=d.choices[index], notes=[];
 s.power+=c[2];s.life+=c[3];s.safety+=c[4];s.flags.push(c[5]);
 if(s.day===2&&!s.flags.includes('filter')){s.life-=25;notes.push('The worn filter caused a breakdown. Life support lost 25 points.');}
 if(s.day===3&&!s.flags.includes('shelter')){s.safety-=25;notes.push('The unprepared shelter reduced protection. Safety lost 25 points.');}
 if(c[5]==='harvest'){if(s.flags.includes('crop')){s.flags.push('food');notes.push('Your earlier plant care paid off. Crop experiment completed!');}else notes.push('The plants need more time because they missed earlier care.');}
 if(c[5]==='transmit'){if(s.flags.includes('research')){s.flags.push('sent');notes.push('Your research reached Earth!');}else notes.push('You sent a status update. There were no research findings ready.');}
 s.power-=12;notes.push('Essential systems used 12 power today.');
 if(s.power<15){s.life-=18;s.safety-=10;notes.push('Low battery strained essential systems. Life support −18, safety −10.');}
 if(s.day<6){s.power+=14;notes.push('Scheduled solar charging restored 14 power.');}
 for(const k of ['power','life','safety'])s[k]=Math.max(0,Math.min(100,s[k]));
 s.log.push({day:s.day+1,title:d.title,choice:c[0],notes,why:d.why});s.day++;
 s.ended=s.day===7||s.life===0||s.safety===0;
 return s;
}
function outcome(s){if(s.life===0||s.safety===0)return 'Mission ended early';if(s.life>=40&&s.safety>=40&&s.power>=15&&s.flags.includes('food')&&s.flags.includes('sent'))return 'Mission success';return 'Partial success';}
if(typeof module!=='undefined')module.exports={days,initial,decide,outcome};


