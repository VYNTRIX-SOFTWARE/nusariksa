/**
 * Small self-contained vector PDF layout for professional internal reports.
 * No external fonts, remote assets, HTML rendering, or dynamic JavaScript.
 * All text is normalized to the printable WinAnsi/ASCII subset supported by
 * the base-14 PDF fonts. Document data must already be authorized upstream.
 */
const WIDTH=595,HEIGHT=842,LEFT=44,RIGHT=551,TOP=84,BOTTOM=764;
const INK='#17233B',MUTED='#566279',PURPLE='#6848CE',LIGHT='#F4F2FC',
  BORDER='#E0E4EE',WHITE='#FFFFFF',GREEN='#247453',AMBER='#935C22',
  RED='#AA3E3F';
const color=hex=>{
  const n=hex.replace('#','');
  return [0,2,4].map(i=>(parseInt(n.slice(i,i+2),16)/255).toFixed(3)).join(' ');
};
export function printable(value){
  return String(value??'').replace(/[\u2010-\u2015]/g,'-')
    .replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"')
    .replace(/\u2026/g,'...').replace(/\u2022/g,'-')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^\x20-\x7e]/g,' ').replace(/\s+/g,' ').trim();
}
const pdfEscape=s=>printable(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
const charWidth=(str,size,bold=false)=>{
  let w=0;for(const c of printable(str)){
    if("il.,:;!|'".includes(c))w+=0.25;
    else if('MW@#%'.includes(c))w+=0.86;
    else if(c===' ')w+=0.28;
    else if('ABCDEFGHJKLMNOPQRSTUVWXYZ'.includes(c))w+=0.66;
    else w+=bold?0.58:0.53;
  }return w*size;
};
export function wrapPdfText(value,width,size=10,bold=false){
  const words=printable(value).split(/\s+/).filter(Boolean);
  const out=[];let line='';
  for(let word of words){
    while(charWidth(word,size,bold)>width){
      if(line){out.push(line);line='';}
      let count=1;
      while(count<word.length&&charWidth(word.slice(0,count+1),size,bold)<=width)count++;
      out.push(word.slice(0,count));word=word.slice(count);
    }
    if(!word)continue;
    const next=line?line+' '+word:word;
    if(line&&charWidth(next,size,bold)>width){out.push(line);line=word;}
    else line=next;
  }
  if(line)out.push(line);
  return out.length?out:['-'];
}
function encodePdf(streams){
  const objects=[],add=value=>(objects.push(value),objects.length);
  const catalog=add(''),pages=add('');
  const regular=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const bold=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const ids=[];
  for(const stream of streams){
    const bytes=Buffer.from(stream,'latin1');
    const content=add('<< /Length '+bytes.length+' >>\nstream\n'+stream+'\nendstream');
    const page=add('<< /Type /Page /Parent '+pages+' 0 R /MediaBox [0 0 '+WIDTH+' '+HEIGHT+
      '] /Resources << /Font << /F1 '+regular+' 0 R /F2 '+bold+
      ' 0 R >> >> /Contents '+content+' 0 R >>');
    ids.push(page);
  }
  objects[catalog-1]='<< /Type /Catalog /Pages '+pages+' 0 R >>';
  objects[pages-1]='<< /Type /Pages /Kids ['+ids.map(n=>n+' 0 R').join(' ')+
    '] /Count '+ids.length+' >>';
  const output=['%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'];
  const offsets=[0];let offset=Buffer.byteLength(output[0],'latin1');
  for(let i=0;i<objects.length;i++){
    offsets.push(offset);
    const part=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';
    output.push(part);offset+=Buffer.byteLength(part,'latin1');
  }
  output.push('xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n');
  for(let i=1;i<offsets.length;i++)
    output.push(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
  output.push('trailer\n<< /Size '+(objects.length+1)+' /Root '+catalog+
    ' 0 R >>\nstartxref\n'+offset+'\n%%EOF\n');
  return Buffer.from(output.join(''),'latin1');
}
export function createProfessionalReport({status='PRATINJAU INTERNAL',
  footer='ASESMEN TI INTERNAL - BUKAN PENGESAHAN OJK'}={}){
  const pages=[];let commands=[],y=TOP;
  const add=s=>commands.push(s);
  const rect=(x,top,w,h,fill=WHITE,stroke=null)=>{
    add(color(fill)+' rg');
    if(stroke)add(color(stroke)+' RG 0.6 w');
    add([x,HEIGHT-top-h,w,h].map(n=>Number(n).toFixed(2)).join(' ')+
      ' re '+(stroke?'B':'f'));
  };
  const rule=(x1,top,x2,stroke=BORDER)=>{
    add(color(stroke)+' RG 0.6 w '+x1+' '+(HEIGHT-top)+' m '+x2+' '+(HEIGHT-top)+' l S');
  };
  const text=(x,top,value,{size=10,bold=false,fill=INK}={})=>{
    add(color(fill)+' rg BT /'+(bold?'F2':'F1')+' '+size+
      ' Tf 1 0 0 1 '+x.toFixed(2)+' '+(HEIGHT-top).toFixed(2)+
      ' Tm ('+pdfEscape(value)+') Tj ET');
  };
  function paragraph(value,{x=LEFT,width=RIGHT-LEFT,size=10,bold=false,
    fill=INK,leading=size*1.55,after=0}={}){
    const lines=wrapPdfText(value,width,size,bold);
    for(const line of lines){ensure(leading+3);text(x,y+size,line,{size,bold,fill});y+=leading;}
    y+=after;return lines.length;
  }
  const startPage=()=>{if(commands.length)pages.push(commands);commands=[];y=TOP;
    rect(0,0,WIDTH,6,PURPLE);
    text(LEFT,38,'NUSARIKSA.',{size:12,bold:true,fill:PURPLE});
    text(355,38,'LAPORAN ASESMEN TI INTERNAL',{size:8,bold:true,fill:MUTED});
    rule(LEFT,52,RIGHT);
    text(LEFT,70,status,{size:8,bold:true,fill:PURPLE});
  };
  const ensure=(height=20)=>{if(y+height>BOTTOM)startPage();};
  const space=(v=12)=>{ensure(v);y+=v;};
  function section(title,index){
    ensure(60);space(16);
    text(LEFT,y+9,String(index).padStart(2,'0')+' / '+printable(title).toUpperCase(),
      {size:10,bold:true,fill:PURPLE});y+=27;
    rule(LEFT,y,RIGHT);y+=12;
  }
  function heading(label){
    ensure(43);text(LEFT,y+16,label,{size:15,bold:true});y+=30;
  }
  function metric(label,value,x,w){
    rect(x,y,w,71,LIGHT,BORDER);
    text(x+13,y+18,printable(label).toUpperCase(),{size:8,bold:true,fill:MUTED});
    text(x+13,y+49,value,{size:23,bold:true,fill:INK});
  }
  function bar(label,count,max,shade=PURPLE){
    ensure(29);
    text(LEFT,y+10,label,{size:9,fill:INK});
    text(RIGHT-30,y+10,String(count),{size:9,bold:true});
    rect(245,y+4,264,8,'#E6E7ED');
    if(max>0&&count>0)rect(245,y+4,264*Math.min(1,count/max),8,shade);
    y+=27;
  }
  function badge(label,shade=PURPLE){
    const txt=printable(label);const w=Math.min(440,charWidth(txt,8,true)+20);
    ensure(26);rect(LEFT,y,w,23,LIGHT,BORDER);
    text(LEFT+10,y+15,txt,{size:8,bold:true,fill:shade});y+=33;
  }
  function labelValue(label,value){
    ensure(37);text(LEFT,y+10,printable(label).toUpperCase(),{size:8,bold:true,fill:MUTED});
    const lines=wrapPdfText(value,340,10);
    for(const line of lines){ensure(17);text(207,y+11,line,{size:10});y+=16;}
    y+=6;rule(LEFT,y,RIGHT);y+=5;
  }
  function listItem(number,title,body,{status:result='',source=''}={}){
    // A long note can continue on another page. Never force clipped rows.
    ensure(79);
    rect(LEFT,y,3,43,PURPLE);
    text(LEFT+12,y+15,number,{size:8,bold:true,fill:PURPLE});
    const titleLines=wrapPdfText(title,390,11,true);
    let top=y;
    for(const line of titleLines){
      ensure(18);
      text(LEFT+48,y+15,line,{size:11,bold:true});
      y+=17;
    }
    y=Math.max(y,top+38);
    if(result){
      const lines=wrapPdfText('Hasil: '+result,RIGHT-LEFT-48,9,true);
      for(const line of lines){ensure(17);text(LEFT+48,y+12,line,{size:9,bold:true,fill:INK});y+=18;}
    }
    if(source){
      paragraph('Rujukan: '+source,{x:LEFT+48,width:RIGHT-LEFT-48,size:8,fill:MUTED});
    }
    paragraph('Catatan: '+(body||'Belum diisi'),{
      x:LEFT+48,width:RIGHT-LEFT-48,size:9,leading:14,
    });
    y+=12;ensure(10);rule(LEFT,y,RIGHT);y+=7;
  }
  function finish(){
    if(commands.length||!pages.length)pages.push(commands);
    const count=pages.length;
    const streams=pages.map((content,i)=>{
      const saved=commands;commands=[...content];
      rule(LEFT,786,RIGHT);
      text(LEFT,805,footer,{size:7,bold:true,fill:MUTED});
      text(RIGHT-93,805,'Halaman '+(i+1)+' / '+count,{size:8,fill:MUTED});
      const final=commands.join('\n');commands=saved;return final;
    });
    return encodePdf(streams);
  }
  startPage();
  return {rect,rule,text,paragraph,space,ensure,section,heading,metric,bar,badge,
    labelValue,listItem,finish,get y(){return y;},set y(value){y=value;},newPage:startPage,
    palette:{INK,MUTED,PURPLE,LIGHT,BORDER,GREEN,AMBER,RED},pageWidth:WIDTH};
}
