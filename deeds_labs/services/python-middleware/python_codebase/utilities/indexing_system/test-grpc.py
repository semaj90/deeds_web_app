#!/usr/bin/env python3
"""
Test script for GRPC Legal AI Server
Tests health check functionality
"""

import grpc
import time
from grpc_health.v1 import health_pb2
from grpc_health.v1 import health_pb2_grpc

def test_grpc_health():
    try:
        # Connect to GRPC server
        channel = grpc.insecure_channel('localhost:50052')
        
        # Wait for connection
        grpc.channel_ready_future(channel).result(timeout=10)
        
        # Create health check client
        stub = health_pb2_grpc.HealthStub(channel)
        
        # Send health check request
        request = health_pb2.HealthCheckRequest()
        response = stub.Check(request, timeout=5)
        
        if response.status == health_pb2.HealthCheckResponse.SERVING:
            print("✅ GRPC Health Check: SERVING")
            return True
        else:
            print(f"❌ GRPC Health Check: {response.status}")
            return False
            
    except grpc.RpcError as e:
        print(f"❌ GRPC Error: {e.code()} - {e.details()}")
        return False
    except Exception as e:
        print(f"❌ Connection Error: {e}")
        return False
    finally:
        if 'channel' in locals():
            channel.close()

if __name__ == '__main__':
    print("🔍 Testing GRPC Legal AI Server...")
    success = test_grpc_health()
    
    if success:
        print("🎉 GRPC server is healthy and responding!")
    else:
        print("⚠️ GRPC server test failed")
        exit(1)