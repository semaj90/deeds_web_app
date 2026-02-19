#include <iostream>
#include <memory>
#include <csignal>
#include <grpcpp/grpcpp.h>
#include "grpc_server.h"
#include "qlora_trainer.h"
#include "training_manager.h"

using namespace legalai::qlora;

std::unique_ptr<GRPCServer> server;
std::unique_ptr<TrainingManager> training_manager;

void signalHandler(int signal) {
    std::cout << "Received signal " << signal << ", shutting down..." << std::endl;

    if (server) {
        server->shutdown();
    }

    if (training_manager) {
        training_manager->stopAllTraining();
    }

    exit(0);
}

int main(int argc, char** argv) {
    // Register signal handlers
    std::signal(SIGINT, signalHandler);
    std::signal(SIGTERM, signalHandler);

    try {
        // Initialize training manager
        training_manager = std::make_unique<TrainingManager>();

        // Initialize gRPC server
        std::string server_address("0.0.0.0:50051");
        server = std::make_unique<GRPCServer>(server_address, training_manager.get());

        std::cout << "Legal AI QLoRA Trainer starting on " << server_address << std::endl;

        // Start the server
        server->run();

    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << std::endl;
        return 1;
    }

    return 0;
}