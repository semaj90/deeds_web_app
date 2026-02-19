#!/usr/bin/env python3
"""
C++ Build Performance Measurement System
Expert-level build optimization with -ftime-trace analysis and CI performance budgets
"""

import os
import sys
import json
import time
import subprocess
import argparse
import statistics
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, asdict
from concurrent.futures import ThreadPoolExecutor, as_completed

@dataclass
class CompilationMetrics:
    """Structured compilation performance metrics"""
    file_path: str
    compile_time_ms: float
    parse_time_ms: float
    codegen_time_ms: float
    template_instantiation_ms: float
    include_count: int
    preprocessor_time_ms: float
    semantic_analysis_ms: float
    object_size_bytes: int
    memory_peak_mb: float
    cache_hit: bool = False
    
@dataclass 
class BuildPerformanceReport:
    """Comprehensive build performance analysis"""
    timestamp: str
    total_build_time_ms: float
    total_files: int
    cache_hits: int
    cache_miss: int
    slowest_files: List[CompilationMetrics]
    fastest_files: List[CompilationMetrics]
    bottleneck_analysis: Dict[str, Any]
    include_analysis: Dict[str, Any]
    regression_analysis: Optional[Dict[str, Any]] = None
    performance_budget: Dict[str, float] = None

class BuildPerformanceMeasurer:
    """Expert-level C++ build performance measurement and optimization"""
    
    def __init__(self, 
                 project_root: str = "../go-microservice",
                 cache_dir: str = ".build-cache",
                 budget_file: str = "build-performance-budget.json"):
        self.project_root = Path(project_root)
        self.cache_dir = Path(cache_dir)
        self.budget_file = Path(budget_file)
        self.trace_dir = self.cache_dir / "ftime-traces"
        self.reports_dir = self.cache_dir / "reports"
        
        # Create directories
        self.cache_dir.mkdir(exist_ok=True)
        self.trace_dir.mkdir(exist_ok=True)
        self.reports_dir.mkdir(exist_ok=True)
        
        # Performance budget thresholds (milliseconds)
        self.default_budget = {
            "max_single_file_compile_time": 5000,  # 5 seconds
            "max_total_build_time": 60000,         # 60 seconds
            "max_parse_time_per_file": 1000,       # 1 second
            "max_template_instantiation": 2000,    # 2 seconds
            "min_cache_hit_ratio": 0.80,           # 80%
            "max_include_depth": 50,               # 50 nested includes
            "max_preprocessor_time": 3000          # 3 seconds
        }
        
    def load_performance_budget(self) -> Dict[str, float]:
        """Load performance budget from file or use defaults"""
        if self.budget_file.exists():
            try:
                with open(self.budget_file) as f:
                    budget = json.load(f)
                    return {**self.default_budget, **budget}
            except Exception as e:
                print(f"Warning: Failed to load budget file: {e}")
        
        return self.default_budget.copy()
    
    def save_performance_budget(self, budget: Dict[str, float]):
        """Save performance budget for CI enforcement"""
        with open(self.budget_file, 'w') as f:
            json.dump(budget, f, indent=2)
    
    def find_cpp_files(self) -> List[Path]:
        """Find all C++ source files in the project"""
        cpp_extensions = {'.cpp', '.cc', '.cxx', '.c++'}
        cpp_files = []
        
        for ext in cpp_extensions:
            cpp_files.extend(self.project_root.glob(f"**/*{ext}"))
        
        return sorted(cpp_files)
    
    def compile_with_trace(self, cpp_file: Path, compiler: str = "g++") -> Tuple[CompilationMetrics, bool]:
        """Compile a single file with -ftime-trace and collect metrics"""
        trace_file = self.trace_dir / f"{cpp_file.stem}.json"
        object_file = self.cache_dir / f"{cpp_file.stem}.o"
        
        # Check cache first
        cache_hit = False
        if object_file.exists() and object_file.stat().st_mtime > cpp_file.stat().st_mtime:
            cache_hit = True
            
        compile_cmd = [
            compiler,
            "-c", str(cpp_file),
            "-o", str(object_file),
            "-ftime-trace",
            f"-ftime-trace-file={trace_file}",
            "-O2", "-std=c++17",
            "-I.", "-I../",
            # Add common include paths for Go microservice project
            "-I../go-microservice",
            "-I../go-microservice/internal"
        ]
        
        start_time = time.time()
        
        try:
            if not cache_hit:
                result = subprocess.run(
                    compile_cmd,
                    cwd=self.project_root,
                    capture_output=True,
                    text=True,
                    timeout=30  # 30 second timeout per file
                )
                
                if result.returncode != 0:
                    print(f"Compilation failed for {cpp_file}: {result.stderr}")
                    return None, False
            
            compile_time_ms = (time.time() - start_time) * 1000
            
            # Parse -ftime-trace output
            metrics = self.parse_trace_file(trace_file, str(cpp_file), compile_time_ms)
            metrics.cache_hit = cache_hit
            
            # Get object file size
            if object_file.exists():
                metrics.object_size_bytes = object_file.stat().st_size
            
            return metrics, True
            
        except subprocess.TimeoutExpired:
            print(f"Compilation timeout for {cpp_file}")
            return None, False
        except Exception as e:
            print(f"Error compiling {cpp_file}: {e}")
            return None, False
    
    def parse_trace_file(self, trace_file: Path, cpp_file: str, compile_time_ms: float) -> CompilationMetrics:
        """Parse -ftime-trace JSON output to extract detailed metrics"""
        default_metrics = CompilationMetrics(
            file_path=cpp_file,
            compile_time_ms=compile_time_ms,
            parse_time_ms=0,
            codegen_time_ms=0,
            template_instantiation_ms=0,
            include_count=0,
            preprocessor_time_ms=0,
            semantic_analysis_ms=0,
            object_size_bytes=0,
            memory_peak_mb=0
        )
        
        if not trace_file.exists():
            return default_metrics
            
        try:
            with open(trace_file) as f:
                trace_data = json.load(f)
            
            # Extract timing information from trace events
            events = trace_data.get('traceEvents', [])
            
            parse_time = 0
            codegen_time = 0
            template_time = 0
            preprocessor_time = 0
            semantic_time = 0
            include_count = 0
            
            for event in events:
                if event.get('ph') == 'X':  # Duration events
                    name = event.get('name', '')
                    duration = event.get('dur', 0) / 1000  # Convert to ms
                    
                    if 'Parse' in name or 'Parsing' in name:
                        parse_time += duration
                    elif 'CodeGen' in name or 'Codegen' in name:
                        codegen_time += duration
                    elif 'Template' in name or 'Instantiat' in name:
                        template_time += duration
                    elif 'Preprocess' in name:
                        preprocessor_time += duration
                    elif 'Sema' in name or 'Semantic' in name:
                        semantic_time += duration
                    elif 'Include' in name or '#include' in name:
                        include_count += 1
            
            return CompilationMetrics(
                file_path=cpp_file,
                compile_time_ms=compile_time_ms,
                parse_time_ms=parse_time,
                codegen_time_ms=codegen_time,
                template_instantiation_ms=template_time,
                include_count=include_count,
                preprocessor_time_ms=preprocessor_time,
                semantic_analysis_ms=semantic_time,
                object_size_bytes=0,  # Will be filled later
                memory_peak_mb=0      # Would need additional tooling
            )
            
        except Exception as e:
            print(f"Error parsing trace file {trace_file}: {e}")
            return default_metrics
    
    def parallel_build_measurement(self, max_workers: int = 4) -> BuildPerformanceReport:
        """Execute parallel build measurement with comprehensive analysis"""
        cpp_files = self.find_cpp_files()
        
        if not cpp_files:
            print("No C++ files found in project")
            return None
        
        print(f"Measuring build performance for {len(cpp_files)} C++ files...")
        
        start_time = time.time()
        compilation_metrics = []
        successful_compiles = 0
        cache_hits = 0
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all compilation tasks
            future_to_file = {
                executor.submit(self.compile_with_trace, cpp_file): cpp_file 
                for cpp_file in cpp_files
            }
            
            # Collect results
            for future in as_completed(future_to_file):
                cpp_file = future_to_file[future]
                try:
                    metrics, success = future.result()
                    if success and metrics:
                        compilation_metrics.append(metrics)
                        successful_compiles += 1
                        if metrics.cache_hit:
                            cache_hits += 1
                        
                        # Progress indicator
                        print(f"✓ {cpp_file.name}: {metrics.compile_time_ms:.1f}ms")
                    else:
                        print(f"✗ {cpp_file.name}: compilation failed")
                        
                except Exception as e:
                    print(f"✗ {cpp_file.name}: {e}")
        
        total_build_time = (time.time() - start_time) * 1000
        
        # Generate comprehensive report
        return self.generate_performance_report(
            compilation_metrics, 
            total_build_time, 
            len(cpp_files),
            cache_hits,
            successful_compiles - cache_hits
        )
    
    def generate_performance_report(self, 
                                   metrics: List[CompilationMetrics],
                                   total_build_time: float,
                                   total_files: int,
                                   cache_hits: int,
                                   cache_misses: int) -> BuildPerformanceReport:
        """Generate comprehensive build performance analysis"""
        
        if not metrics:
            return BuildPerformanceReport(
                timestamp=time.strftime("%Y-%m-%d %H:%M:%S"),
                total_build_time_ms=total_build_time,
                total_files=total_files,
                cache_hits=0,
                cache_miss=0,
                slowest_files=[],
                fastest_files=[],
                bottleneck_analysis={},
                include_analysis={}
            )
        
        # Sort by compilation time
        sorted_by_time = sorted(metrics, key=lambda m: m.compile_time_ms, reverse=True)
        
        # Bottleneck analysis
        bottleneck_analysis = {
            "avg_compile_time_ms": statistics.mean(m.compile_time_ms for m in metrics),
            "median_compile_time_ms": statistics.median(m.compile_time_ms for m in metrics),
            "p95_compile_time_ms": sorted([m.compile_time_ms for m in metrics])[int(len(metrics) * 0.95)],
            "total_parse_time_ms": sum(m.parse_time_ms for m in metrics),
            "total_template_time_ms": sum(m.template_instantiation_ms for m in metrics),
            "total_codegen_time_ms": sum(m.codegen_time_ms for m in metrics),
            "avg_includes_per_file": statistics.mean(m.include_count for m in metrics),
            "cache_hit_ratio": cache_hits / (cache_hits + cache_misses) if (cache_hits + cache_misses) > 0 else 0
        }
        
        # Include analysis
        include_analysis = {
            "max_includes": max(m.include_count for m in metrics),
            "avg_includes": statistics.mean(m.include_count for m in metrics),
            "files_with_heavy_includes": [
                m.file_path for m in metrics if m.include_count > 30
            ],
            "preprocessor_bottlenecks": [
                m.file_path for m in metrics if m.preprocessor_time_ms > 1000
            ]
        }
        
        return BuildPerformanceReport(
            timestamp=time.strftime("%Y-%m-%d %H:%M:%S"),
            total_build_time_ms=total_build_time,
            total_files=total_files,
            cache_hits=cache_hits,
            cache_miss=cache_misses,
            slowest_files=sorted_by_time[:10],  # Top 10 slowest
            fastest_files=sorted_by_time[-10:],  # Top 10 fastest
            bottleneck_analysis=bottleneck_analysis,
            include_analysis=include_analysis
        )
    
    def check_performance_budget(self, report: BuildPerformanceReport) -> Dict[str, Any]:
        """Check build performance against budget and generate CI-ready results"""
        budget = self.load_performance_budget()
        violations = []
        warnings = []
        
        # Check total build time
        if report.total_build_time_ms > budget["max_total_build_time"]:
            violations.append({
                "metric": "total_build_time",
                "actual": report.total_build_time_ms,
                "budget": budget["max_total_build_time"],
                "severity": "critical"
            })
        
        # Check individual file compile times
        for metrics in report.slowest_files:
            if metrics.compile_time_ms > budget["max_single_file_compile_time"]:
                violations.append({
                    "metric": "single_file_compile_time",
                    "file": metrics.file_path,
                    "actual": metrics.compile_time_ms,
                    "budget": budget["max_single_file_compile_time"],
                    "severity": "high"
                })
        
        # Check cache hit ratio
        actual_cache_ratio = report.cache_hits / (report.cache_hits + report.cache_miss) if (report.cache_hits + report.cache_miss) > 0 else 0
        if actual_cache_ratio < budget["min_cache_hit_ratio"]:
            warnings.append({
                "metric": "cache_hit_ratio", 
                "actual": actual_cache_ratio,
                "budget": budget["min_cache_hit_ratio"],
                "severity": "medium"
            })
        
        # Check template instantiation times
        heavy_template_files = [
            m for m in report.slowest_files 
            if m.template_instantiation_ms > budget["max_template_instantiation"]
        ]
        
        for metrics in heavy_template_files:
            warnings.append({
                "metric": "template_instantiation_time",
                "file": metrics.file_path,
                "actual": metrics.template_instantiation_ms,
                "budget": budget["max_template_instantiation"],
                "severity": "medium"
            })
        
        return {
            "budget_status": "PASSED" if not violations else "FAILED",
            "violations": violations,
            "warnings": warnings,
            "total_issues": len(violations) + len(warnings),
            "recommendations": self.generate_optimization_recommendations(report, violations, warnings)
        }
    
    def generate_optimization_recommendations(self, 
                                            report: BuildPerformanceReport,
                                            violations: List[Dict],
                                            warnings: List[Dict]) -> List[str]:
        """Generate actionable optimization recommendations"""
        recommendations = []
        
        # Compilation time recommendations
        if any(v["metric"] == "single_file_compile_time" for v in violations):
            recommendations.append(
                "Consider splitting large source files or reducing template complexity in slow files"
            )
            recommendations.append(
                "Implement precompiled headers (PCH) for frequently included headers"
            )
        
        # Cache optimization
        cache_ratio = report.cache_hits / (report.cache_hits + report.cache_miss) if (report.cache_hits + report.cache_miss) > 0 else 0
        if cache_ratio < 0.8:
            recommendations.append(
                "Implement distributed caching with sccache or similar tool"
            )
            recommendations.append(
                "Consider content-addressable caching for better cache hit rates"
            )
        
        # Template optimization
        if any(v["metric"] == "template_instantiation_time" for v in violations + warnings):
            recommendations.append(
                "Review template instantiation patterns - consider explicit instantiation"
            )
            recommendations.append(
                "Use extern template declarations to reduce duplicate instantiations"
            )
        
        # Include optimization
        if report.include_analysis["max_includes"] > 50:
            recommendations.append(
                "Implement include-what-you-use (IWYU) to reduce unnecessary includes"
            )
            recommendations.append(
                "Consider forward declarations instead of full includes where possible"
            )
        
        # Parallel build optimization
        if report.total_build_time_ms > 30000:  # > 30 seconds
            recommendations.append(
                "Increase parallel build jobs (-j flag) if not CPU-bound"
            )
            recommendations.append(
                "Consider distributed compilation with distcc"
            )
        
        return recommendations
    
    def save_report(self, report: BuildPerformanceReport, budget_check: Dict[str, Any]):
        """Save comprehensive report for CI integration and historical analysis"""
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        report_file = self.reports_dir / f"build_performance_{timestamp}.json"
        
        full_report = {
            "performance_metrics": asdict(report),
            "budget_analysis": budget_check,
            "metadata": {
                "project_root": str(self.project_root),
                "measurement_tool": "measure_build.py",
                "version": "1.0.0"
            }
        }
        
        with open(report_file, 'w') as f:
            json.dump(full_report, f, indent=2)
        
        print(f"📊 Performance report saved: {report_file}")
        
        # Also save latest report for CI
        latest_report = self.reports_dir / "latest_performance_report.json"
        with open(latest_report, 'w') as f:
            json.dump(full_report, f, indent=2)
    
    def print_summary(self, report: BuildPerformanceReport, budget_check: Dict[str, Any]):
        """Print executive summary of build performance"""
        print("\n" + "="*80)
        print("🚀 C++ BUILD PERFORMANCE ANALYSIS")
        print("="*80)
        
        print(f"📊 Build Summary:")
        print(f"   Total Files:      {report.total_files}")
        print(f"   Successful:       {len(report.slowest_files + report.fastest_files)}")
        print(f"   Build Time:       {report.total_build_time_ms/1000:.2f}s")
        print(f"   Cache Hits:       {report.cache_hits}/{report.cache_hits + report.cache_miss}")
        print(f"   Cache Hit Ratio:  {(report.cache_hits/(report.cache_hits + report.cache_miss)*100):.1f}%")
        
        print(f"\n⚡ Performance Metrics:")
        print(f"   Avg Compile Time: {report.bottleneck_analysis['avg_compile_time_ms']:.1f}ms")
        print(f"   P95 Compile Time: {report.bottleneck_analysis['p95_compile_time_ms']:.1f}ms")
        print(f"   Total Parse Time: {report.bottleneck_analysis['total_parse_time_ms']/1000:.2f}s")
        print(f"   Template Time:    {report.bottleneck_analysis['total_template_time_ms']/1000:.2f}s")
        
        print(f"\n🔍 Include Analysis:")
        print(f"   Avg Includes:     {report.include_analysis['avg_includes']:.1f}")
        print(f"   Max Includes:     {report.include_analysis['max_includes']}")
        print(f"   Heavy Include Files: {len(report.include_analysis['files_with_heavy_includes'])}")
        
        print(f"\n📈 Budget Status: {budget_check['budget_status']}")
        if budget_check['violations']:
            print("❌ Budget Violations:")
            for violation in budget_check['violations']:
                print(f"   • {violation['metric']}: {violation['actual']:.1f} > {violation['budget']:.1f}")
        
        if budget_check['warnings']:
            print("⚠️  Warnings:")
            for warning in budget_check['warnings']:
                print(f"   • {warning['metric']}: {warning['actual']:.1f}")
        
        if budget_check['recommendations']:
            print("\n💡 Optimization Recommendations:")
            for i, rec in enumerate(budget_check['recommendations'], 1):
                print(f"   {i}. {rec}")
        
        print("="*80)

def main():
    parser = argparse.ArgumentParser(
        description="Expert-level C++ build performance measurement and optimization"
    )
    parser.add_argument("--project-root", default="../go-microservice",
                       help="Root directory of C++ project")
    parser.add_argument("--workers", type=int, default=4,
                       help="Number of parallel compilation workers")
    parser.add_argument("--compiler", default="g++",
                       help="C++ compiler to use")
    parser.add_argument("--budget-only", action="store_true",
                       help="Only check against performance budget (CI mode)")
    parser.add_argument("--update-budget", action="store_true",
                       help="Update performance budget based on current measurements")
    
    args = parser.parse_args()
    
    measurer = BuildPerformanceMeasurer(args.project_root)
    
    if args.budget_only:
        # CI mode - check latest report against budget
        latest_report_file = measurer.reports_dir / "latest_performance_report.json"
        if not latest_report_file.exists():
            print("❌ No performance baseline found. Run measurement first.")
            sys.exit(1)
            
        with open(latest_report_file) as f:
            data = json.load(f)
            
        budget_check = data["budget_analysis"]
        print(f"Budget Status: {budget_check['budget_status']}")
        
        if budget_check['budget_status'] == "FAILED":
            print("❌ Performance budget violations detected")
            for violation in budget_check['violations']:
                print(f"   {violation['metric']}: {violation['actual']:.1f} > {violation['budget']:.1f}")
            sys.exit(1)
        else:
            print("✅ Performance budget check passed")
            sys.exit(0)
    
    # Full measurement mode
    report = measurer.parallel_build_measurement(args.workers)
    
    if not report:
        print("❌ Build measurement failed")
        sys.exit(1)
    
    budget_check = measurer.check_performance_budget(report)
    measurer.save_report(report, budget_check)
    measurer.print_summary(report, budget_check)
    
    if args.update_budget:
        # Update budget based on current performance + 10% buffer
        new_budget = {
            "max_total_build_time": report.total_build_time_ms * 1.1,
            "max_single_file_compile_time": max(m.compile_time_ms for m in report.slowest_files) * 1.1,
            "min_cache_hit_ratio": max(0.8, (report.cache_hits / (report.cache_hits + report.cache_miss)) * 0.95)
        }
        measurer.save_performance_budget(new_budget)
        print("💾 Performance budget updated")
    
    # Exit with error code if budget violations
    if budget_check['budget_status'] == "FAILED":
        sys.exit(1)

if __name__ == "__main__":
    main()