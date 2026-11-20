// Parent Atlas ATMP v1 native packer and conservative AABB frustum culling.
// Pure C Node-API: no node-addon-api dependency. Browser uses TS fallback.
// GCC/Clang x86: AVX2 runtime-dispatched for batches of 8 AABBs;
// MSVC: portable scalar path unless a separately compiled AVX2 translation unit is added.
#include <node_api.h>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <limits>
#include <vector>
#if (defined(__GNUC__) || defined(__clang__)) && (defined(__x86_64__) || defined(__i386__))
#include <immintrin.h>
#define ATLAS_AVX2_DISPATCH 1
#else
#define ATLAS_AVX2_DISPATCH 0
#endif
namespace {
constexpr uint32_t kHeader=64, kMaxVertices=1000000, kMaxIndices=4000000;
static_assert(sizeof(float)==4 && sizeof(uint32_t)==4, "Requires IEEE754 float32");
napi_value Fail(napi_env env, const char* s, bool range=false) {
  if(range) napi_throw_range_error(env, nullptr, s);
  else napi_throw_type_error(env, nullptr, s);
  return nullptr;
}
bool GetTyped(napi_env env,napi_value v,napi_typedarray_type& t,size_t& length,void*& data){
  napi_value ab; size_t off;
  return napi_get_typedarray_info(env,v,&t,&length,&data,&ab,&off)==napi_ok;
}
void Put16(uint8_t* p,size_t k,uint16_t x){p[k]=static_cast<uint8_t>(x);p[k+1]=static_cast<uint8_t>(x>>8);}
void Put32(uint8_t* p,size_t k,uint32_t x){for(int i=0;i<4;i++)p[k+i]=static_cast<uint8_t>(x>>(8*i));}
void PutF32(uint8_t* p,size_t k,float x){uint32_t bits;std::memcpy(&bits,&x,4);Put32(p,k,bits);}
napi_value ByteArray(napi_env env,size_t bytes, void** ptr){
  napi_value ab,out;
  if(napi_create_arraybuffer(env,bytes,ptr,&ab)!=napi_ok) return nullptr;
  if(napi_create_typedarray(env,napi_uint8_array,bytes,ab,0,&out)!=napi_ok) return nullptr;
  return out;
}
napi_value PackMesh(napi_env env, napi_callback_info info){
  size_t argc=3; napi_value argv[3];
  if(napi_get_cb_info(env,info,&argc,argv,nullptr,nullptr)!=napi_ok || argc<2)
    return Fail(env,"packMesh(positions: Float32Array, indices: Uint16Array|Uint32Array, maxBytes?: number)");
  napi_typedarray_type pt,it; size_t pn,in;void* pd=nullptr;void* id=nullptr;
  if(!GetTyped(env,argv[0],pt,pn,pd)||pt!=napi_float32_array ||
     !GetTyped(env,argv[1],it,in,id)||(it!=napi_uint16_array && it!=napi_uint32_array))
    return Fail(env,"Invalid mesh input typed arrays");
  if(!pn||pn%3||!in||in%3||pn/3>kMaxVertices||in>kMaxIndices)
    return Fail(env,"Mesh vertex/index count invalid or too large",true);
  const size_t vc=pn/3;
  const bool index32=vc>65535;
  uint64_t po=kHeader,io=(po+vc*6+3)&~uint64_t(3),bytes=io+in*(index32?4:2);
  double maxBytes=8.0*1024*1024;
  if(argc>=3 && (napi_get_value_double(env,argv[2],&maxBytes)!=napi_ok ||
                 !std::isfinite(maxBytes)||maxBytes<kHeader||maxBytes>128.0*1024*1024||std::floor(maxBytes)!=maxBytes))
    return Fail(env,"Invalid maxBytes budget",true);
  if(bytes>static_cast<uint64_t>(maxBytes)) return Fail(env,"Mesh exceeds maxBytes budget",true);
  const float* src=static_cast<float*>(pd);
  float mn[3]={INFINITY,INFINITY,INFINITY};float mx[3]={-INFINITY,-INFINITY,-INFINITY};
  for(size_t i=0;i<pn;i++) {
    if(!std::isfinite(src[i])) return Fail(env,"Non-finite mesh coordinate");
    int j=i%3;mn[j]=std::min(mn[j],src[i]);mx[j]=std::max(mx[j],src[i]);
  }
  const uint16_t* i16=it==napi_uint16_array?static_cast<uint16_t*>(id):nullptr;
  const uint32_t* i32=it==napi_uint32_array?static_cast<uint32_t*>(id):nullptr;
  for(size_t i=0;i<in;i++) if((i16?static_cast<uint32_t>(i16[i]):i32[i])>=vc)
    return Fail(env,"Mesh triangle index out of range",true);
  void* dstptr=nullptr;napi_value out=ByteArray(env,static_cast<size_t>(bytes),&dstptr);
  if(!out) return nullptr;
  uint8_t* dst=static_cast<uint8_t*>(dstptr);std::memset(dst,0,static_cast<size_t>(bytes));
  dst[0]='A';dst[1]='T';dst[2]='M';dst[3]='P';
  Put16(dst,4,1);Put16(dst,6,index32?1:0);Put32(dst,8,static_cast<uint32_t>(vc));Put32(dst,12,static_cast<uint32_t>(in));
  double ext[3];
  for(int j=0;j<3;j++) {ext[j]=static_cast<double>(mx[j])-mn[j];PutF32(dst,16+j*4,mn[j]);PutF32(dst,28+j*4,static_cast<float>(ext[j]));}
  Put32(dst,40,static_cast<uint32_t>(po));Put32(dst,44,static_cast<uint32_t>(io));Put32(dst,48,static_cast<uint32_t>(bytes));
  for(size_t i=0;i<vc;i++)for(int j=0;j<3;j++){
    double normalized=ext[j]==0?0:(static_cast<double>(src[i*3+j])-mn[j])/ext[j]*65535.0;
    uint16_t q=static_cast<uint16_t>(std::max(0.0,std::min(65535.0,std::floor(normalized+0.5))));
    Put16(dst,po+i*6+j*2,q);
  }
  for(size_t i=0;i<in;i++) {
    uint32_t index=i16?i16[i]:i32[i];
    if(index32)Put32(dst,io+i*4,index);
    else Put16(dst,io+i*2,static_cast<uint16_t>(index));
  }
  return out;
}
inline bool Intersect(const float* b,const float* p){
  for(int k=0;k<24;k+=4){
    float x=p[k]>=0?b[3]:b[0],y=p[k+1]>=0?b[4]:b[1],z=p[k+2]>=0?b[5]:b[2];
    if(p[k]*x+p[k+1]*y+p[k+2]*z+p[k+3]<0) return false;
  }
  return true;
}
#if ATLAS_AVX2_DISPATCH
__attribute__((target("avx2")))
void CullAvx2(const float* bounds,const float* planes,uint8_t* out,size_t count){
  size_t i=0;
  const __m256i offsets = _mm256_setr_epi32(0,6,12,18,24,30,36,42);
  for(;i+8<=count;i+=8){
    const float* b=bounds+i*6;
    __m256 mnx=_mm256_i32gather_ps(b,offsets,4),mny=_mm256_i32gather_ps(b+1,offsets,4),mnz=_mm256_i32gather_ps(b+2,offsets,4);
    __m256 mxx=_mm256_i32gather_ps(b+3,offsets,4),mxy=_mm256_i32gather_ps(b+4,offsets,4),mxz=_mm256_i32gather_ps(b+5,offsets,4);
    __m256 mask=_mm256_castsi256_ps(_mm256_set1_epi32(-1));
    for(int k=0;k<24;k+=4){
      const __m256 xx=planes[k]>=0?mxx:mnx, yy=planes[k+1]>=0?mxy:mny, zz=planes[k+2]>=0?mxz:mnz;
      __m256 d=_mm256_add_ps(_mm256_add_ps(_mm256_mul_ps(xx,_mm256_set1_ps(planes[k])),
                  _mm256_mul_ps(yy,_mm256_set1_ps(planes[k+1]))),
                  _mm256_add_ps(_mm256_mul_ps(zz,_mm256_set1_ps(planes[k+2])),_mm256_set1_ps(planes[k+3])));
      mask=_mm256_and_ps(mask,_mm256_cmp_ps(d,_mm256_set1_ps(-1e-5f),_CMP_GE_OQ));
    }
    int bits=_mm256_movemask_ps(mask);
    for(int lane=0;lane<8;lane++)out[i+lane]=static_cast<uint8_t>((bits>>lane)&1);
  }
  for(;i<count;i++)out[i]=Intersect(bounds+i*6,planes);
}
#endif
napi_value CullAabbs(napi_env env,napi_callback_info info){
  size_t argc=2; napi_value argv[2];
  if(napi_get_cb_info(env,info,&argc,argv,nullptr,nullptr)!=napi_ok || argc!=2)
    return Fail(env,"cullAabbs(bounds: Float32Array, planes: Float32Array)");
  napi_typedarray_type bt,pt;size_t bn,pn;void* bd=nullptr;void* pd=nullptr;
  if(!GetTyped(env,argv[0],bt,bn,bd)||!GetTyped(env,argv[1],pt,pn,pd)||bt!=napi_float32_array||pt!=napi_float32_array||bn%6||pn!=24||bn/6>kMaxVertices)
    return Fail(env,"bounds must be N*6 Float32Array; planes exactly 24 Float32Array",true);
  const float* bounds=static_cast<float*>(bd),*planes=static_cast<float*>(pd);
  for(size_t i=0;i<bn;i++)if(!std::isfinite(bounds[i]))return Fail(env,"Non-finite AABB");
  for(size_t i=0;i<pn;i++)if(!std::isfinite(planes[i]))return Fail(env,"Non-finite plane");
  for(size_t i=0;i<bn;i+=6)if(bounds[i]>bounds[i+3]||bounds[i+1]>bounds[i+4]||bounds[i+2]>bounds[i+5])return Fail(env,"Inverted AABB",true);
  void* result=nullptr;napi_value output=ByteArray(env,bn/6,&result);
  if(!output)return nullptr;
#if ATLAS_AVX2_DISPATCH
  if(bn/6>=64 && __builtin_cpu_supports("avx2")){CullAvx2(bounds,planes,static_cast<uint8_t*>(result),bn/6);return output;}
#endif
  for(size_t i=0;i<bn/6;i++)static_cast<uint8_t*>(result)[i]=Intersect(bounds+i*6,planes);
  return output;
}
napi_value Init(napi_env env,napi_value exports){
  napi_property_descriptor p[]={
    {"packMesh",0,PackMesh,0,0,0,napi_default,0},
    {"cullAabbs",0,CullAabbs,0,0,0,napi_default,0}
  };
  if(napi_define_properties(env,exports,2,p)!=napi_ok) return nullptr;
  return exports;
}
} // namespace
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
