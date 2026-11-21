/**
 * 功能：生成河水、天空、岸线、城市和植被，支持昼夜照明切换。
 * 时间：2026-11-20 | 作者：lq
 */
import * as T from 'three';
import { BANK_Y, buildCityscape, cbdTowers } from './cityscape.js';
import { buildLandscape } from './landscape.js';

// 功能：压低日景的青绿饱和度，保留钢蓝江面、自然岸景与原有夜景灯光。时间：2026-11-20 | 作者：lq。
const dayFog = 0xa5b2c3;
const daySkyLight = 0xe3ebfa;
const dayGroundLight = 0x81828b;
const daySunLight = 0xffefd9;
const nightFog = 0x18243e;
// 功能：保持阴雨天的远景、天空与水面色温一致，夜雨仍可辨识桥灯。时间：2026-11-20 | 作者：lq。
const rainDayFog = 0x778590;
const rainNightFog = 0x1d2b39;
const sunDirection = new T.Vector3(0.8, 0.36, -0.63).normalize();
const noise = `
  float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float noise(vec2 p) {
    vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);
  }
  float fbm(vec2 p) { return noise(p)*.54 + noise(p*2.03)*.26 + noise(p*4.12)*.13 + noise(p*8.21)*.07; }
`;
const skyShader = `
  varying vec3 vWorld;
  uniform float uTime, uNight, uRain;
  uniform vec3 uSun;
  ${noise}
  void main() {
    vec3 d=normalize(vWorld-cameraPosition);
    float h=max(0.0,d.y), toward=max(0.0,dot(d,uSun));
    vec3 color=mix(vec3(.48,.57,.68),vec3(.11,.26,.49),pow(h,.62));
    color+=vec3(.40,.24,.09)*pow(toward,7.0)*(1.0-h*.63);
    color+=vec3(2.0,1.1,.4)*smoothstep(.9997,.99994,toward);
    vec3 night=mix(vec3(.041,.062,.12),vec3(.009,.017,.045),pow(h,.52));
    vec2 starCell=floor(d.xz/(d.y+.28)*900.0);
    night+=vec3(.33,.42,.65)*step(.9986,hash(starCell))*smoothstep(.10,.38,h);
    color=mix(color,night,uNight);
    vec2 cloudUV=d.xz/(h+.22)*2.2+vec2(.45+uTime*.002,2.0);
    float n=fbm(cloudUV+fbm(cloudUV*1.54)*.32);
    float cloud=smoothstep(.52,.70,n)*smoothstep(.01,.19,h);
    vec3 cloudCol=mix(vec3(.39,.51,.59),vec3(1.0,.96,.84),smoothstep(.51,.78,n));
    cloudCol=mix(cloudCol,vec3(.050,.067,.109),uNight);
    color=mix(color,cloudCol,cloud*.86);
    // 低云覆盖晴天的太阳与夜间星光。
    vec3 rainHorizon=mix(vec3(.26,.32,.37),vec3(.038,.060,.087),uNight);
    vec3 rainCeiling=mix(vec3(.085,.12,.16),vec3(.012,.023,.045),uNight);
    vec3 overcast=mix(rainHorizon,rainCeiling,smoothstep(.01,.62,h))*(.72+.63*n);
    gl_FragColor=vec4(mix(color,overcast,uRain),1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
// 功能：沿江轴推进拉长的水纹，保留细波与桥下阴影；不改变水面几何。时间：2026-11-20 | 作者：lq。
const waterShader = `
  varying vec3 vWorld;
  uniform float uFlowTime, uNight, uRain;
  uniform vec3 uSun, uFog;
  uniform vec4 uSkyline[${cbdTowers.length}];
  ${noise}
  void main() {
    vec2 p=vWorld.xz;
    vec3 eye=normalize(cameraPosition-vWorld);
    float depth=length(cameraPosition-vWorld);
    vec2 flow=p-vec2(uFlowTime*7.2,0.0);
    float grain=fbm(flow*vec2(.075,.42));
    float streak=smoothstep(.50,.76,grain);
    float a=sin(dot(flow,vec2(.39,.83))+grain*2.4);
    float b=sin(dot(flow,vec2(-.70,1.20))+uFlowTime*.83);
    float fine=1.0-smoothstep(42.0,158.0,depth);
    float c=sin(dot(flow,vec2(1.62,2.47))-uFlowTime*1.29)*fine;
    vec3 n=normalize(vec3(a*.064+b*.029+c*.015,1.0,a*.049-b*.048+c*.012));
    vec3 blendedSun=mix(uSun,normalize(vec3(.75,.09,-.43)),uNight);
    float grazing=pow(1.0-max(dot(eye,n),0.0),3.8);
    float glint=pow(max(dot(reflect(-blendedSun,n),eye),0.0),27.0);
    vec3 deep=mix(vec3(.054,.106,.167),vec3(.013,.027,.054),uNight);
    vec3 reflected=mix(vec3(.31,.385,.49),vec3(.042,.091,.17),uNight);
    vec3 color=mix(deep,reflected,grazing*.82)+(grain-.48)*mix(.088,.033,uNight);
    color+=streak*mix(vec3(.056,.072,.09),vec3(.018,.025,.051),uNight)*(.38+grazing*.62);
    color=mix(color,color*vec3(.60,.69,.75),uRain);
    color+=glint*mix(vec3(.34,.29,.19),vec3(.18,.16,.40),uNight)*(.35+grain*1.1)*(1.0-uRain*.84);
    // 功能：沿视线投影对岸塔楼，用水纹打散倒影。时间：2026-11-21 | 作者：lq。
    vec2 ray=p-cameraPosition.xz;
    if (ray.y>4.0 && p.y<126.0) {
      vec2 shimmer=vec2(a*1.8+b*.8, grain*3.9+c*.42)*(1.0+uRain*.55);
      float skyline=0.0;
      for (int i=0; i<${cbdTowers.length}; i++) {
        vec4 tower=uSkyline[i];
        float t=(tower.y-p.y)/ray.y;
        float x=p.x+ray.x*t+shimmer.x;
        float y=cameraPosition.y*t+shimmer.y;
        float sides=1.0-smoothstep(tower.z-1.5,tower.z+2.5,abs(x-tower.x));
        float silhouette=sides*smoothstep(13.0,16.0,y)*(1.0-smoothstep(tower.w-4.0,tower.w+2.0,y));
        skyline=max(skyline,silhouette);
      }
      float ripple=.27+.73*smoothstep(.26,.68,grain+a*.11);
      color=mix(color,mix(vec3(.104,.149,.181),vec3(.031,.043,.068),uNight),
        skyline*ripple*grazing*.63*(1.0-uRain*.68));
    }
    float shadow=1.0-.32*(1.0-smoothstep(9.0,18.0,abs(abs(p.x)-94.0)))*(1.0-smoothstep(117.0,145.0,abs(p.y)));
    color*=shadow;
    color=mix(color,uFog,1.0-exp(-depth*depth*mix(.0000016,.00002025,uRain)));
    gl_FragColor=vec4(color,1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function planes(scene) {
  const fragmentCommon = { uTime: { value: 0 }, uFlowTime: { value: 0 }, uSun: { value: sunDirection }, uNight: { value: 0 }, uRain: { value: 0 }, uFog: { value: new T.Color(dayFog) } };
  const vertexShader = `
    varying vec3 vWorld;
    void main() {
      vec4 w=modelMatrix*vec4(position,1.0);
      vWorld=w.xyz;
      gl_Position=projectionMatrix*viewMatrix*w;
    }
  `;
  const sky = new T.Mesh(new T.SphereGeometry(1700, 24, 16), new T.ShaderMaterial({ uniforms: fragmentCommon, vertexShader, fragmentShader: skyShader, side: T.BackSide, depthWrite: false }));
  sky.renderOrder = -100;
  sky.frustumCulled = false;
  scene.add(sky);
  // 功能：将建筑位置传给水面材质，倒影随楼群布局自动更新。时间：2026-11-21 | 作者：lq。
  const waterUniforms = {
    ...fragmentCommon,
    uSkyline: { value: cbdTowers.map(({ x, z, width, depth, height }) =>
      new T.Vector4(x, z - depth / 2, width / 2, BANK_Y + height)) },
  };
  const water = new T.Mesh(new T.PlaneGeometry(3300, 3300), new T.ShaderMaterial({ uniforms: waterUniforms, vertexShader, fragmentShader: waterShader }));
  water.rotation.x = -Math.PI / 2;
  scene.add(water);
  return { uniforms: fragmentCommon, sky };
}

export function buildEnvironment(scene) {
  scene.fog = new T.FogExp2(dayFog, 0.00185);
  const { uniforms, sky } = planes(scene);
  // 功能：两岸地貌与参考建筑独立生成，统一由环境控制昼夜。时间：2026-11-21 | 作者：lq。
  buildLandscape(scene);
  const city = buildCityscape(scene);
  const fill = new T.HemisphereLight(daySkyLight, dayGroundLight, 2.1);
  scene.add(fill);
  const sun = new T.DirectionalLight(daySunLight, 2.55);
  sun.position.copy(sunDirection).multiplyScalar(300);
  scene.add(sun);
  return {
    // 功能：独立合成昼夜与天气，雨天缩短能见距离并改为冷色漫射光。时间：2026-11-20 | 作者：lq。
    setWeather(night, wet) {
      scene.fog.color.set(night ? (wet ? rainNightFog : nightFog) : (wet ? rainDayFog : dayFog));
      scene.fog.density = wet ? 0.0045 : night ? 0.00235 : 0.00185;
      uniforms.uFog.value.copy(scene.fog.color);
      uniforms.uNight.value = Number(night);
      uniforms.uRain.value = Number(wet);
      fill.color.set(wet ? 0xb2c9de : night ? 0x9cbcff : daySkyLight);
      fill.groundColor.set(night ? 0x383846 : dayGroundLight);
      fill.intensity = night ? 0.63 : wet ? 1.65 : 2.1;
      sun.color.set(night || wet ? 0x80a6e6 : daySunLight);
      sun.intensity = night ? (wet ? 0.39 : 0.59) : (wet ? 0.65 : 2.55);
      city.setNight(night);
    },
    // 功能：减少动态效果时停住水纹，但保留水面材质。时间：2026-11-20 | 作者：lq。
    update(camera, time, reduceMotion) {
      sky.position.copy(camera.position);
      uniforms.uTime.value = reduceMotion ? 0 : time;
      uniforms.uFlowTime.value = reduceMotion ? 0 : time;
    },
  };
}
