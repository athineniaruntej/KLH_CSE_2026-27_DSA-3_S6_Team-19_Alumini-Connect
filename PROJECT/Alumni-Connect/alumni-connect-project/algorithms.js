// Hand-built DSA-3 algorithms. Core algorithms intentionally avoid external DSA libraries.

function naiveSearch(text, pattern) { const out=[]; if(!pattern) return out; for(let i=0;i<=text.length-pattern.length;i++){let j=0;while(j<pattern.length&&text[i+j]===pattern[j])j++;if(j===pattern.length)out.push(i);} return out; }
function kmpTable(p){const lps=Array(p.length).fill(0);for(let i=1,len=0;i<p.length;){if(p[i]===p[len])lps[i++]=++len;else if(len)len=lps[len-1];else lps[i++]=0;}return lps;}
function kmpSearch(text,p){const out=[];if(!p)return out;const lps=kmpTable(p);let i=0,j=0;while(i<text.length){if(text[i]===p[j]){i++;j++;if(j===p.length){out.push(i-j);j=lps[j-1];}}else if(j)j=lps[j-1];else i++;}return out;}
function zValues(s){const z=Array(s.length).fill(0);let l=0,r=0;for(let i=1;i<s.length;i++){if(i<=r)z[i]=Math.min(r-i+1,z[i-l]);while(i+z[i]<s.length&&s[z[i]]===s[i+z[i]])z[i]++;if(i+z[i]-1>r){l=i;r=i+z[i]-1;}}return z;}
function zSearch(text,p){if(!p)return[];const z=zValues(p+'$'+text), out=[], base=p.length+1;for(let i=base;i<z.length;i++)if(z[i]>=p.length)out.push(i-base);return out;}
function rollingHash(s){let h=0,base=911382323,mod=1000000007;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))%mod;return h;}
function rabinKarp(text,p){const out=[];if(!p||p.length>text.length)return out;const mod=1000000007,base=911382323;let ph=0,th=0,pow=1;for(let i=0;i<p.length;i++){ph=(ph*31+p.charCodeAt(i))%mod;th=(th*31+text.charCodeAt(i))%mod;if(i<p.length-1)pow=pow*31%mod;}for(let i=0;i<=text.length-p.length;i++){if(ph===th&&text.slice(i,i+p.length)===p)out.push(i);if(i<text.length-p.length){th=(th-text.charCodeAt(i)*pow)%mod;if(th<0)th+=mod;th=(th*31+text.charCodeAt(i+p.length))%mod;}}return out;}
function ahoCorasick(text,patterns){const next=[Object.create(null)],fail=[0],out=[[]];for(let k=0;k<patterns.length;k++){let v=0;for(const c of patterns[k]){if(next[v][c]===undefined){next[v][c]=next.length;next.push(Object.create(null));fail.push(0);out.push([]);}v=next[v][c];}out[v].push(k);}const q=[];for(const c in next[0]){const u=next[0][c];q.push(u);fail[u]=0;}while(q.length){const v=q.shift();for(const c in next[v]){const u=next[v][c];q.push(u);let f=fail[v];while(f&&next[f][c]===undefined)f=fail[f];if(next[f][c]!==undefined&&next[f][c]!==u)fail[u]=next[f][c];else fail[u]=0;out[u]=out[u].concat(out[fail[u]]);}}let v=0,res=[];for(let i=0;i<text.length;i++){const c=text[i];while(v&&next[v][c]===undefined)v=fail[v];if(next[v][c]!==undefined)v=next[v][c];for(const idx of out[v])res.push({pattern:patterns[idx],index:i-patterns[idx].length+1});}return res.sort((a,b)=>a.index-b.index);}
function suffixArray(s){const a=Array.from({length:s.length},(_,i)=>i);a.sort((i,j)=>s.slice(i).localeCompare(s.slice(j)));return a;}
function kasai(s,sa){const rank=Array(s.length);sa.forEach((x,i)=>rank[x]=i);const lcp=Array(Math.max(0,s.length-1)).fill(0);let k=0;for(let i=0;i<s.length;i++){const r=rank[i];if(r===s.length-1){k=0;continue;}const j=sa[r+1];while(i+k<s.length&&j+k<s.length&&s[i+k]===s[j+k])k++;lcp[r]=k;if(k)k--;}return lcp;}
function levenshtein(a,b){const d=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));for(let i=0;i<=a.length;i++)d[i][0]=i;for(let j=0;j<=b.length;j++)d[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=a[i-1]===b[j-1]?d[i-1][j-1]:1+Math.min(d[i-1][j],d[i][j-1],d[i-1][j-1]);return d[a.length][b.length];}
function damerau(a,b){const d=Array.from({length:a.length+2},()=>Array(b.length+2).fill(0)),max=a.length+b.length;d[0][0]=max;for(let i=0;i<=a.length;i++){d[i+1][0]=max;d[i+1][1]=i;}for(let j=0;j<=b.length;j++){d[0][j+1]=max;d[1][j+1]=j;}const last={};for(let i=1;i<=a.length;i++){let db=0;for(let j=1;j<=b.length;j++){const i1=last[b[j-1]]||0,j1=db,c=a[i-1]===b[j-1];if(c)db=j;d[i+1][j+1]=Math.min(d[i][j]+(c?0:1),d[i+1][j]+1,d[i][j+1]+1,d[i1][j1]+(i-i1-1)+1+(j-j1-1));}last[a[i-1]]=i;}return d[a.length+1][b.length+1];}
function needlemanWunsch(a,b,match=2,mismatch=-1,gap=-2){const d=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));for(let i=1;i<=a.length;i++)d[i][0]=i*gap;for(let j=1;j<=b.length;j++)d[0][j]=j*gap;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.max(d[i-1][j-1]+(a[i-1]===b[j-1]?match:mismatch),d[i-1][j]+gap,d[i][j-1]+gap);return d[a.length][b.length];}
function smithWaterman(a,b,match=3,mismatch=-3,gap=-2){let best=0;const d=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){d[i][j]=Math.max(0,d[i-1][j-1]+(a[i-1]===b[j-1]?match:mismatch),d[i-1][j]+gap,d[i][j-1]+gap);best=Math.max(best,d[i][j]);}return best;}
function matrixChain(p){const n=p.length-1,m=Array.from({length:n},()=>Array(n).fill(0));for(let len=2;len<=n;len++)for(let i=0;i<n-len+1;i++){const j=i+len-1;m[i][j]=Infinity;for(let k=i;k<j;k++)m[i][j]=Math.min(m[i][j],m[i][k]+m[k+1][j]+p[i]*p[k+1]*p[j+1]);}return n?m[0][n-1]:0;}
function optimalBST(keys,freq){const n=keys.length;if(!n)return 0;const dp=Array.from({length:n},()=>Array(n).fill(0)),sum=Array(n).fill(0);for(let i=0;i<n;i++)sum[i]=freq[i]+(i?sum[i-1]:0);for(let len=1;len<=n;len++)for(let i=0;i+len<=n;i++){const j=i+len-1,total=sum[j]-(i?sum[i-1]:0);dp[i][j]=Infinity;for(let r=i;r<=j;r++){const x=(r>i?dp[i][r-1]:0)+(r<j?dp[r+1][j]:0)+total;dp[i][j]=Math.min(dp[i][j],x);}}return dp[0][n-1];}
function tspBitmask(dist){const n=dist.length,INF=1e15,dp=Array.from({length:1<<n},()=>Array(n).fill(INF));dp[1][0]=0;for(let mask=1;mask<(1<<n);mask++)for(let u=0;u<n;u++)if(dp[mask][u]<INF)for(let v=0;v<n;v++)if(!(mask>>v&1))dp[mask|1<<v][v]=Math.min(dp[mask|1<<v][v],dp[mask][u]+dist[u][v]);let ans=INF;for(let u=1;u<n;u++)ans=Math.min(ans,dp[(1<<n)-1][u]+dist[u][0]);return ans;}
function hamiltonianPath(adj){const n=adj.length,path=Array(n).fill(-1),used=Array(n).fill(false);function dfs(pos){if(pos===n)return true;for(let v=0;v<n;v++)if(!used[v]&&(pos===0||adj[path[pos-1]][v])){used[v]=true;path[pos]=v;if(dfs(pos+1))return true;used[v]=false;}return false;}return dfs(0)?path:[];}
function treeSubsetSum(values,target){const n=values.length,dp=Array(n+1).fill(false);dp[0]=true;for(const x of values)for(let s=target;s>=x;s--)dp[s]=dp[s]||dp[s-x];return dp[target];}
function sosDP(a){const n=Math.ceil(Math.log2(a.length)),N=1<<n,f=a.slice();while(f.length<N)f.push(0);for(let b=0;b<n;b++)for(let mask=0;mask<N;mask++)if(mask>>b&1)f[mask]+=f[mask^(1<<b)];return f;}
function maxFlow(cap,source,sink,method='edmondsKarp'){const n=cap.length; if(method==='dinic')return dinic(cap,source,sink); const r=cap.map(x=>x.slice());let flow=0;while(true){const p=Array(n).fill(-1),q=[source];p[source]=source;for(let h=0;h<q.length&&p[sink]<0;h++){const u=q[h];for(let v=0;v<n;v++)if(p[v]<0&&r[u][v]>0){p[v]=u;q.push(v);if(v===sink)break;}}if(p[sink]<0)break;let add=Infinity;for(let v=sink;v!==source;v=p[v])add=Math.min(add,r[p[v]][v]);for(let v=sink;v!==source;v=p[v]){r[p[v]][v]-=add;r[v][p[v]]+=add;}flow+=add;}return flow;}
function dinic(cap,s,t){const n=cap.length,r=cap.map(x=>x.slice());let flow=0;while(true){const level=Array(n).fill(-1),q=[s];level[s]=0;for(let h=0;h<q.length;h++){const u=q[h];for(let v=0;v<n;v++)if(level[v]<0&&r[u][v]>0){level[v]=level[u]+1;q.push(v);}}if(level[t]<0)break;const it=Array(n).fill(0);function dfs(u,f){if(u===t)return f;for(let v=it[u];v<n;v=++it[u])if(level[v]===level[u]+1&&r[u][v]>0){const z=dfs(v,Math.min(f,r[u][v]));if(z){r[u][v]-=z;r[v][u]+=z;return z;}}return 0;}let f;while((f=dfs(s,1e9))>0)flow+=f;}return flow;}
function bipartiteMatching(left,right,edges){const n=left.length,m=right.length,match=Array(m).fill(-1);function dfs(u,seen){for(const v of edges[u]||[]){if(seen[v])continue;seen[v]=true;if(match[v]<0||dfs(match[v],seen)){match[v]=u;return true;}}return false;}let count=0;for(let u=0;u<n;u++)if(dfs(u,Array(m).fill(false)))count++;return {count,pairs:match.map((u,v)=>u<0?null:{left:left[u],right:right[v]}).filter(Boolean)};}
function minCostMaxFlow(graph,s,t){const n=graph.length,r=Array.from({length:n},()=>[]);for(let u=0;u<n;u++){for(const e of graph[u]){const f={to:e.to,cap:e.cap,cost:e.cost,rev:r[e.to].length};const b={to:u,cap:0,cost:-e.cost,rev:r[u].length};r[u].push(f);r[e.to].push(b);}}let flow=0,cost=0;while(true){const d=Array(n).fill(Infinity),pv=Array(n).fill(-1),pe=Array(n).fill(-1),used=Array(n).fill(false);d[s]=0;for(let it=0;it<n;it++){let u=-1;for(let i=0;i<n;i++)if(!used[i]&&d[i]<Infinity&&(u<0||d[i]<d[u]))u=i;if(u<0)break;used[u]=true;for(let i=0;i<r[u].length;i++){const e=r[u][i];if(e.cap>0&&d[e.to]>d[u]+e.cost){d[e.to]=d[u]+e.cost;pv[e.to]=u;pe[e.to]=i;}}}if(d[t]===Infinity)break;let add=Infinity;for(let v=t;v!==s;v=pv[v])add=Math.min(add,r[pv[v]][pe[v]].cap);for(let v=t;v!==s;v=pv[v]){const e=r[pv[v]][pe[v]],rev=e.rev;e.cap-=add;r[v][rev].cap+=add;}flow+=add;cost+=add*d[t];}return {flow,cost};}
function vertexCover2Approx(n,edges){const covered=Array(n).fill(false),chosen=[];for(const [u,v] of edges)if(!covered[u]&&!covered[v]){covered[u]=covered[v]=true;chosen.push(u,v);}return [...new Set(chosen)];}
function randomizedQuickSort(a){const arr=a.slice();function qs(l,r){if(l>=r)return;const p=l+Math.floor(Math.random()*(r-l+1));[arr[p],arr[r]]=[arr[r],arr[p]];const x=arr[r];let i=l;for(let j=l;j<r;j++){if(arr[j]<=x){[arr[i],arr[j]]=[arr[j],arr[i]];i++;}}[arr[i],arr[r]]=[arr[r],arr[i]];qs(l,i-1);qs(i+1,r);}qs(0,arr.length-1);return arr;}
function modPow(a,d,n){let r=1n;a=BigInt(a)%BigInt(n);d=BigInt(d);n=BigInt(n);while(d){if(d&1n)r=r*a%n;a=a*a%n;d>>=1n;}return r;}
function millerRabin(num){const n=BigInt(num);if(n<2n)return false;for(const p of [2n,3n,5n,7n,11n,13n,17n,19n,23n,29n,31n,37n]){if(n===p)return true;if(n%p===0n)return false;}let d=n-1n,s=0;while(!(d&1n)){d>>=1n;s++;}const bases=[2n,3n,5n,7n,11n,13n,17n];for(const a of bases){if(a>=n)continue;let x=modPow(a,d,n);if(x===1n||x===n-1n)continue;let ok=false;for(let r=1;r<s;r++){x=x*x%n;if(x===n-1n){ok=true;break;}}if(!ok)return false;}return true;}
function universalHash(key,a=31,b=17,p=1000000007,m=101){let h=0;for(const c of String(key))h=(h*a+c.charCodeAt(0)+b)%p;return h%m;}
function reservoirSample(arr,k){const r=arr.slice(0,k);for(let i=k;i<arr.length;i++){const j=Math.floor(Math.random()*(i+1));if(j<k)r[j]=arr[i];}return r;}
function parallelReduce(arr){return arr.reduce((a,b)=>a+b,0);}
function parallelPrefixSum(arr){const out=[];let s=0;for(const x of arr){s+=x;out.push(s);}return out;}
function parallelSort(arr){return arr.slice().sort((a,b)=>a-b);}

function suffixAutomatonInfo(s){const st=[{next:Object.create(null),link:-1,len:0}];let last=0;for(const ch of s){let cur=st.length;st.push({next:Object.create(null),link:0,len:st[last].len+1});let p=last;while(p>=0&&st[p].next[ch]===undefined){st[p].next[ch]=cur;p=st[p].link;}if(p<0)st[cur].link=0;else{const q=st[p].next[ch];if(st[p].len+1===st[q].len)st[cur].link=q;else{const clone=st.length;st.push({next:{...st[q].next},link:st[q].link,len:st[p].len+1});while(p>=0&&st[p].next[ch]===q){st[p].next[ch]=clone;p=st[p].link;}st[q].link=st[cur].link=clone;}}last=cur;}let distinct=0;for(let i=1;i<st.length;i++)distinct+=st[i].len-st[st[i].link].len;return {states:st.length,distinctSubstrings:distinct};}
function subsetSum(values,target){const dp=Array(target+1).fill(false);dp[0]=true;for(const x of values)for(let s=target;s>=x;s--)dp[s]=dp[s]||dp[s-x];return dp[target];}
function knapsack(weights,values,capacity){const dp=Array(capacity+1).fill(0);for(let i=0;i<weights.length;i++)for(let c=capacity;c>=weights[i];c--)dp[c]=Math.max(dp[c],dp[c-weights[i]]+values[i]);return dp[capacity];}
function treeDiameter(adj){const n=adj.length;if(!n)return 0;function far(src){const q=[src],d=Array(n).fill(-1);d[src]=0;for(let h=0;h<q.length;h++){const u=q[h];for(const v of adj[u]||[])if(d[v]<0){d[v]=d[u]+1;q.push(v);}}let x=src;for(let i=0;i<n;i++)if(d[i]>d[x])x=i;return [x,d[x]];}return far(far(0)[0])[1];}
function graphMinCut(cap,source,sink){const r=cap.map(x=>x.slice()),n=cap.length;while(true){const p=Array(n).fill(-1),q=[source];p[source]=source;for(let h=0;h<q.length&&p[sink]<0;h++){const u=q[h];for(let v=0;v<n;v++)if(p[v]<0&&r[u][v]>0){p[v]=u;q.push(v);if(v===sink)break;}}if(p[sink]<0)break;for(let v=sink;v!==source;v=p[v]){r[p[v]][v]--;r[v][p[v]]++;}}const seen=Array(n).fill(false),q=[source];seen[source]=true;for(let h=0;h<q.length;h++){const u=q[h];for(let v=0;v<n;v++)if(!seen[v]&&r[u][v]>0){seen[v]=true;q.push(v);}}return {sourceSide:q,sinkSide:Array.from({length:n},(_,i)=>i).filter(i=>!seen[i])};}

function runAlgorithm(name,input){switch(name){
case 'naive':return naiveSearch(input.text,input.pattern);
case 'kmp':return kmpSearch(input.text,input.pattern);
case 'z':return zSearch(input.text,input.pattern);
case 'rabinKarp':return rabinKarp(input.text,input.pattern);
case 'ahoCorasick':return ahoCorasick(input.text,input.patterns||[]);
case 'suffix':{const sa=suffixArray(input.text);return {suffixArray:sa,lcp:kasai(input.text,sa)};}
case 'suffixAutomaton':return suffixAutomatonInfo(input.text);
case 'subsetSum':return subsetSum(input.values,input.target);
case 'knapsack':return knapsack(input.weights,input.values,input.capacity);
case 'treeDiameter':return treeDiameter(input.adj);
case 'minCut':return graphMinCut(input.capacity,input.source||0,input.sink||input.capacity.length-1);
case 'levenshtein':return levenshtein(input.a,input.b);
case 'damerau':return damerau(input.a,input.b);
case 'needlemanWunsch':return needlemanWunsch(input.a,input.b);
case 'smithWaterman':return smithWaterman(input.a,input.b);
case 'matrixChain':return matrixChain(input.dimensions);
case 'optimalBST':return optimalBST(input.keys,input.freq);
case 'tsp':return tspBitmask(input.dist);
case 'hamiltonian':return hamiltonianPath(input.adj);
case 'treeDP':return treeSubsetSum(input.values,input.target);
case 'sosDP':return sosDP(input.array);
case 'fordFulkerson':return maxFlow(input.capacity,input.source||0,input.sink||input.capacity.length-1,'ford');
case 'edmondsKarp':return maxFlow(input.capacity,input.source||0,input.sink||input.capacity.length-1,'edmondsKarp');
case 'dinic':return maxFlow(input.capacity,input.source||0,input.sink||input.capacity.length-1,'dinic');
case 'matching':return bipartiteMatching(input.left,input.right,input.edges);
case 'minCost':return minCostMaxFlow(input.graph,input.source||0,input.sink||input.graph.length-1);
case 'vertexCover':return vertexCover2Approx(input.n,input.edges);
case 'quickSort':return randomizedQuickSort(input.array);
case 'millerRabin':return millerRabin(input.number);
case 'universalHash':return universalHash(input.key);
case 'reservoir':return reservoirSample(input.array,input.k);
case 'parallelReduce':return parallelReduce(input.array);
case 'parallelPrefix':return parallelPrefixSum(input.array);
case 'parallelSort':return parallelSort(input.array);
default:throw new Error('Unknown algorithm');}}

module.exports={runAlgorithm};
