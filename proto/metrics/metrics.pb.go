package metrics

import (
	"context"
	"fmt"

	"google.golang.org/grpc"
)

// STUB proto definitions to unblock build; replace with real generated code.

type MetricType int32

const (
	MetricType_METRIC_TYPE_COUNTER   MetricType = 0
	MetricType_METRIC_TYPE_GAUGE     MetricType = 1
	MetricType_METRIC_TYPE_HISTOGRAM MetricType = 2
)

type MetricValue struct {
	CounterValue   int64
	GaugeValue     float64
	HistogramValue *Histogram
}

func (mv *MetricValue) GetCounterValue() int64 { if mv!=nil { return mv.CounterValue }; return 0 }
func (mv *MetricValue) GetGaugeValue() float64 { if mv!=nil { return mv.GaugeValue }; return 0 }
func (mv *MetricValue) GetHistogramValue() *Histogram { if mv!=nil { return mv.HistogramValue }; return nil }

type Histogram struct { Buckets map[float64]uint64 }

type Metric struct {
	Name   string
	Type   MetricType
	Labels map[string]string
	Value  *MetricValue
}

type ReportMetricsRequest struct {
	ServiceName  string
	GlobalLabels map[string]string
	Metrics      []*Metric
}

type ReportMetricsResponse struct {
	Success          bool
	Message          string
	MetricsProcessed int32
	Errors           []string
}

type StreamMetricsRequest struct{}

// gRPC service stub interfaces

type MetricsServiceServer interface {
	ReportMetrics(ctx context.Context, req *ReportMetricsRequest) (*ReportMetricsResponse, error)
	StreamMetrics(*StreamMetricsRequest, MetricsService_StreamMetricsServer) error
}

type UnimplementedMetricsServiceServer struct{}

func (*UnimplementedMetricsServiceServer) ReportMetrics(ctx context.Context, req *ReportMetricsRequest) (*ReportMetricsResponse, error) { return nil, fmt.Errorf("not implemented") }
func (*UnimplementedMetricsServiceServer) StreamMetrics(*StreamMetricsRequest, MetricsService_StreamMetricsServer) error { return fmt.Errorf("not implemented") }

type MetricsService_StreamMetricsServer interface { Send(*ReportMetricsResponse) error }

// NOTE: This stub purposely omits registration helpers.
// Added minimal registration helper for metrics_full build.
func RegisterMetricsServiceServer(s *grpc.Server, srv MetricsServiceServer) {
	// In real generated code this sets up method handlers; here we omit for brevity.
	// Downstream code depends only on ability to call this without panic.
}
