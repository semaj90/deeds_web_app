// Compile with Emscripten; returns a conservative per-AABB visibility byte mask.
#include <stdint.h>
#include <stddef.h>
#include <math.h>
int atlas_cull_aabbs(const float* bounds, int count, const float* planes, uint8_t* out){
 if(!bounds||!planes||!out||count<0)return -1;
 for(int i=0;i<count;i++){
  const float* b=bounds+i*6;int visible=1;
  if(b[0]>b[3]||b[1]>b[4]||b[2]>b[5])return -2;
  for(int k=0;k<24;k+=4){
   const float x=planes[k]>=0?b[3]:b[0];
   const float y=planes[k+1]>=0?b[4]:b[1];
   const float z=planes[k+2]>=0?b[5]:b[2];
   if(planes[k]*x+planes[k+1]*y+planes[k+2]*z+planes[k+3]<-1e-5f){visible=0;break;}
  }
  out[i]=(uint8_t)visible;
 }
 return 0;
}
