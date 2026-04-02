use async_trait::async_trait;
use futures::Stream;

use super::types::{ChatRequest, ChatResponse, ModelInfo, StreamDelta};

#[async_trait]
pub trait ModelProvider: Send + Sync {
    async fn list_models(&self) -> crate::Result<Vec<ModelInfo>>;

    async fn chat_completion(&self, request: ChatRequest) -> crate::Result<ChatResponse>;

    async fn chat_completion_stream(
        &self,
        request: ChatRequest,
    ) -> crate::Result<Box<dyn Stream<Item = crate::Result<StreamDelta>> + Send + Unpin>>;

    async fn health_check(&self) -> crate::Result<bool>;
}
