package xjson

import (
	std "encoding/json"
	"testing"

	"github.com/bytedance/sonic"
)

type sample struct {
	ID string `json:"id"`
	Title string `json:"title"`
	Content string `json:"content"`
	Values []int `json:"values"`
}

var benchData = sample{ID:"abc123", Title:"Example", Content: string(make([]byte, 1024)), Values: []int{1,2,3,4,5,6,7,8,9,10}}

func BenchmarkStdMarshal(b *testing.B){ for i:=0;i<b.N;i++ { _,_ = std.Marshal(benchData) } }
func BenchmarkXjsonMarshal(b *testing.B){ for i:=0;i<b.N;i++ { _,_ = Marshal(benchData) } }
func BenchmarkSonicMarshal(b *testing.B){ for i:=0;i<b.N;i++ { _,_ = sonic.Marshal(benchData) } }

func BenchmarkStdUnmarshal(b *testing.B){ buf,_ := std.Marshal(benchData); b.ResetTimer(); for i:=0;i<b.N;i++ { var out sample; _ = std.Unmarshal(buf, &out) } }
func BenchmarkXjsonUnmarshal(b *testing.B){ buf,_ := std.Marshal(benchData); b.ResetTimer(); for i:=0;i<b.N;i++ { var out sample; _ = Unmarshal(buf, &out) } }
func BenchmarkSonicUnmarshal(b *testing.B){ buf,_ := std.Marshal(benchData); b.ResetTimer(); for i:=0;i<b.N;i++ { var out sample; _ = sonic.Unmarshal(buf, &out) } }
